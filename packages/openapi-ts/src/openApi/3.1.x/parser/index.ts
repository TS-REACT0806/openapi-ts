import type { IR } from '../../../ir/types';
import type { State } from '../../shared/types/state';
import { canProcessRef, createFilters } from '../../shared/utils/filter';
import { mergeParametersObjects } from '../../shared/utils/parameter';
import type {
  OpenApiV3_1_X,
  ParameterObject,
  PathItemObject,
  PathsObject,
  RequestBodyObject,
  SecuritySchemeObject,
} from '../types/spec';
import { parseOperation } from './operation';
import { parametersArrayToObject, parseParameter } from './parameter';
import { parseRequestBody } from './requestBody';
import { parseSchema } from './schema';
import { parseServers } from './server';
export const parseV3_1_X = (context: IR.Context<OpenApiV3_1_X>) => {
  const state: State = {
    ids: new Map(),
    operationIds: new Map(),
  };
  const securitySchemesMap = new Map<string, SecuritySchemeObject>();

  const excludeFilters = createFilters(context.config.input.exclude);
  const includeFilters = createFilters(context.config.input.include);

  const shouldProcessRef = ($ref: string, schema: Record<string, any>) =>
    canProcessRef({
      $ref,
      excludeFilters,
      includeFilters,
      schema,
    });

  // TODO: parser - handle more component types, old parser handles only parameters and schemas
  if (context.spec.components) {
    for (const name in context.spec.components.securitySchemes) {
      const securityOrReference =
        context.spec.components.securitySchemes[name]!;
      const securitySchemeObject =
        '$ref' in securityOrReference
          ? context.resolveRef<SecuritySchemeObject>(securityOrReference.$ref)
          : securityOrReference;
      securitySchemesMap.set(name, securitySchemeObject);
    }

    for (const name in context.spec.components.parameters) {
      const $ref = `#/components/parameters/${name}`;
      const parameterOrReference = context.spec.components.parameters[name]!;
      const parameter =
        '$ref' in parameterOrReference
          ? context.resolveRef<ParameterObject>(parameterOrReference.$ref)
          : parameterOrReference;

      if (!shouldProcessRef($ref, parameter)) {
        continue;
      }

      parseParameter({
        $ref,
        context,
        parameter,
      });
    }

    for (const name in context.spec.components.requestBodies) {
      const $ref = `#/components/requestBodies/${name}`;
      const requestBodyOrReference =
        context.spec.components.requestBodies[name]!;
      const requestBody =
        '$ref' in requestBodyOrReference
          ? context.resolveRef<RequestBodyObject>(requestBodyOrReference.$ref)
          : requestBodyOrReference;

      if (!shouldProcessRef($ref, requestBody)) {
        continue;
      }

      parseRequestBody({
        $ref,
        context,
        requestBody,
      });
    }

    for (const name in context.spec.components.schemas) {
      const $ref = `#/components/schemas/${name}`;
      const schema = context.spec.components.schemas[name]!;

      if (!shouldProcessRef($ref, schema)) {
        continue;
      }

      parseSchema({
        $ref,
        context,
        schema,
      });
    }
  }

  parseServers({ context });

  for (const path in context.spec.paths) {
    const pathItem = context.spec.paths[path as keyof PathsObject]!;

    const finalPathItem = pathItem.$ref
      ? {
          ...context.resolveRef<PathItemObject>(pathItem.$ref),
          ...pathItem,
        }
      : pathItem;

    const operationArgs: Omit<Parameters<typeof parseOperation>[0], 'method'> =
      {
        context,
        operation: {
          description: finalPathItem.description,
          parameters: parametersArrayToObject({
            context,
            parameters: finalPathItem.parameters,
          }),
          security: context.spec.security,
          servers: finalPathItem.servers,
          summary: finalPathItem.summary,
        },
        path: path as keyof PathsObject,
        securitySchemesMap,
        state,
      };

    const $refDelete = `#/paths${path}/delete`;
    if (
      finalPathItem.delete &&
      shouldProcessRef($refDelete, finalPathItem.delete)
    ) {
      parseOperation({
        ...operationArgs,
        method: 'delete',
        operation: {
          ...operationArgs.operation,
          ...finalPathItem.delete,
          parameters: mergeParametersObjects({
            source: parametersArrayToObject({
              context,
              parameters: finalPathItem.delete.parameters,
            }),
            target: operationArgs.operation.parameters,
          }),
        },
      });
    }

    const $refGet = `#/paths${path}/get`;
    if (finalPathItem.get && shouldProcessRef($refGet, finalPathItem.get)) {
      parseOperation({
        ...operationArgs,
        method: 'get',
        operation: {
          ...operationArgs.operation,
          ...finalPathItem.get,
          parameters: mergeParametersObjects({
            source: parametersArrayToObject({
              context,
              parameters: finalPathItem.get.parameters,
            }),
            target: operationArgs.operation.parameters,
          }),
        },
      });
    }

    const $refHead = `#/paths${path}/head`;
    if (finalPathItem.head && shouldProcessRef($refHead, finalPathItem.head)) {
      parseOperation({
        ...operationArgs,
        method: 'head',
        operation: {
          ...operationArgs.operation,
          ...finalPathItem.head,
          parameters: mergeParametersObjects({
            source: parametersArrayToObject({
              context,
              parameters: finalPathItem.head.parameters,
            }),
            target: operationArgs.operation.parameters,
          }),
        },
      });
    }

    const $refOptions = `#/paths${path}/options`;
    if (
      finalPathItem.options &&
      shouldProcessRef($refOptions, finalPathItem.options)
    ) {
      parseOperation({
        ...operationArgs,
        method: 'options',
        operation: {
          ...operationArgs.operation,
          ...finalPathItem.options,
          parameters: mergeParametersObjects({
            source: parametersArrayToObject({
              context,
              parameters: finalPathItem.options.parameters,
            }),
            target: operationArgs.operation.parameters,
          }),
        },
      });
    }

    const $refPatch = `#/paths${path}/patch`;
    if (
      finalPathItem.patch &&
      shouldProcessRef($refPatch, finalPathItem.patch)
    ) {
      parseOperation({
        ...operationArgs,
        method: 'patch',
        operation: {
          ...operationArgs.operation,
          ...finalPathItem.patch,
          parameters: mergeParametersObjects({
            source: parametersArrayToObject({
              context,
              parameters: finalPathItem.patch.parameters,
            }),
            target: operationArgs.operation.parameters,
          }),
        },
      });
    }

    const $refPost = `#/paths${path}/post`;
    if (finalPathItem.post && shouldProcessRef($refPost, finalPathItem.post)) {
      parseOperation({
        ...operationArgs,
        method: 'post',
        operation: {
          ...operationArgs.operation,
          ...finalPathItem.post,
          parameters: mergeParametersObjects({
            source: parametersArrayToObject({
              context,
              parameters: finalPathItem.post.parameters,
            }),
            target: operationArgs.operation.parameters,
          }),
        },
      });
    }

    const $refPut = `#/paths${path}/put`;
    if (finalPathItem.put && shouldProcessRef($refPut, finalPathItem.put)) {
      parseOperation({
        ...operationArgs,
        method: 'put',
        operation: {
          ...operationArgs.operation,
          ...finalPathItem.put,
          parameters: mergeParametersObjects({
            source: parametersArrayToObject({
              context,
              parameters: finalPathItem.put.parameters,
            }),
            target: operationArgs.operation.parameters,
          }),
        },
      });
    }

    const $refTrace = `#/paths${path}/trace`;
    if (
      finalPathItem.trace &&
      shouldProcessRef($refTrace, finalPathItem.trace)
    ) {
      parseOperation({
        ...operationArgs,
        method: 'trace',
        operation: {
          ...operationArgs.operation,
          ...finalPathItem.trace,
          parameters: mergeParametersObjects({
            source: parametersArrayToObject({
              context,
              parameters: finalPathItem.trace.parameters,
            }),
            target: operationArgs.operation.parameters,
          }),
        },
      });
    }
  }
};
