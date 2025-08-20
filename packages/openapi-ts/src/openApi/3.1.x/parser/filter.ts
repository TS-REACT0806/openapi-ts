import { createOperationKey } from '../../../ir/operation';
import type { Logger } from '../../../utils/logger';
import { addNamespace, removeNamespace } from '../../shared/utils/filter';
import { httpMethods } from '../../shared/utils/operation';
import type { OpenApiV3_1_X, PathItemObject, PathsObject } from '../types/spec';

/**
 * Replace source spec with filtered version.
 */
export const filterSpec = ({
  logger,
  operations,
  parameters,
  preserveOrder,
  requestBodies,
  responses,
  schemas,
  spec,
}: {
  logger: Logger;
  operations: Set<string>;
  parameters: Set<string>;
  preserveOrder: boolean;
  requestBodies: Set<string>;
  responses: Set<string>;
  schemas: Set<string>;
  spec: OpenApiV3_1_X;
}) => {
  const eventFilterSpec = logger.timeEvent('filter-spec');
  if (spec.components) {
    if (spec.components.parameters) {
      const filtered: typeof spec.components.parameters = {};

      if (preserveOrder) {
        for (const [name, source] of Object.entries(
          spec.components.parameters,
        )) {
          if (parameters.has(addNamespace('parameter', name))) {
            filtered[name] = source;
          }
        }
      } else {
        for (const key of parameters) {
          const { name } = removeNamespace(key);
          const source = spec.components.parameters[name];
          if (source) {
            filtered[name] = source;
          }
        }
      }

      spec.components.parameters = filtered;
    }

    if (spec.components.requestBodies) {
      const filtered: typeof spec.components.requestBodies = {};

      if (preserveOrder) {
        for (const [name, source] of Object.entries(
          spec.components.requestBodies,
        )) {
          if (requestBodies.has(addNamespace('body', name))) {
            filtered[name] = source;
          }
        }
      } else {
        for (const key of requestBodies) {
          const { name } = removeNamespace(key);
          const source = spec.components.requestBodies[name];
          if (source) {
            filtered[name] = source;
          }
        }
      }

      spec.components.requestBodies = filtered;
    }

    if (spec.components.responses) {
      const filtered: typeof spec.components.responses = {};

      if (preserveOrder) {
        for (const [name, source] of Object.entries(
          spec.components.responses,
        )) {
          if (responses.has(addNamespace('response', name))) {
            filtered[name] = source;
          }
        }
      } else {
        for (const key of responses) {
          const { name } = removeNamespace(key);
          const source = spec.components.responses[name];
          if (source) {
            filtered[name] = source;
          }
        }
      }

      spec.components.responses = filtered;
    }

    if (spec.components.schemas) {
      const filtered: typeof spec.components.schemas = {};

      if (preserveOrder) {
        for (const [name, source] of Object.entries(spec.components.schemas)) {
          if (schemas.has(addNamespace('schema', name))) {
            filtered[name] = source;
          }
        }
      } else {
        for (const key of schemas) {
          const { name } = removeNamespace(key);
          const source = spec.components.schemas[name];
          if (source) {
            filtered[name] = source;
          }
        }
      }

      spec.components.schemas = filtered;
    }
  }

  if (spec.paths) {
    for (const entry of Object.entries(spec.paths)) {
      const path = entry[0] as keyof PathsObject;
      const pathItem = entry[1] as PathItemObject;

      for (const method of httpMethods) {
        const operation = pathItem[method];
        if (!operation) {
          continue;
        }

        const key = addNamespace(
          'operation',
          createOperationKey({ method, path }),
        );
        if (!operations.has(key)) {
          delete pathItem[method];
        }
      }

      // remove paths that have no operations left
      if (!Object.keys(pathItem).length) {
        delete spec.paths[path];
      }
    }
  }
  eventFilterSpec.timeEnd();
};
