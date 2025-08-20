import { createOperationKey } from '../../../ir/operation';
import type { Logger } from '../../../utils/logger';
import { httpMethods } from '../../shared/utils/operation';
import type {
  ValidatorIssue,
  ValidatorResult,
} from '../../shared/utils/validator';
import type { OpenApiV3_1_X, PathItemObject, PathsObject } from '../types/spec';

export const validateOpenApiSpec = (
  spec: OpenApiV3_1_X,
  logger: Logger,
): ValidatorResult => {
  const eventValidate = logger.timeEvent('validate');
  const issues: Array<ValidatorIssue> = [];
  const operationIds = new Map();

  if (spec.paths) {
    for (const entry of Object.entries(spec.paths)) {
      const path = entry[0] as keyof PathsObject;
      const pathItem = entry[1] as PathItemObject;
      for (const method of httpMethods) {
        const operation = pathItem[method];
        if (!operation) {
          continue;
        }

        const operationKey = createOperationKey({ method, path });

        if (operation.operationId) {
          if (!operationIds.has(operation.operationId)) {
            operationIds.set(operation.operationId, operationKey);
          } else {
            issues.push({
              code: 'duplicate_key',
              context: {
                key: 'operationId',
                value: operation.operationId,
              },
              message:
                'Duplicate `operationId` found. Each `operationId` must be unique.',
              path: ['paths', path, method, 'operationId'],
              severity: 'error',
            });
          }
        }
      }
    }
  }

  if (spec.servers) {
    if (typeof spec.servers !== 'object' || !Array.isArray(spec.servers)) {
      issues.push({
        code: 'invalid_type',
        message: '`servers` must be an array.',
        path: [],
        severity: 'error',
      });
    }

    for (let index = 0; index < spec.servers.length; index++) {
      const server = spec.servers[index];
      if (!server || typeof server !== 'object') {
        issues.push({
          code: 'invalid_type',
          context: {
            actual: typeof server,
            expected: 'object',
          },
          message: 'Each entry in `servers` must be an object.',
          path: ['servers', index],
          severity: 'error',
        });
      } else {
        if (!server.url) {
          issues.push({
            code: 'missing_required_field',
            context: {
              field: 'url',
            },
            message: 'Missing required field `url` in server object.',
            path: ['servers', index],
            severity: 'error',
          });
        }
      }
    }
  }

  eventValidate.timeEnd();
  return {
    issues,
    valid: !issues.some((issue) => issue.severity === 'error'),
  };
};
