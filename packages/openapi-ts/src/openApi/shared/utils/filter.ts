import { createOperationKey } from '../../../ir/operation';
import type { Config } from '../../../types/config';
import type { Logger } from '../../../utils/logger';
import type { PathItemObject, PathsObject } from '../../3.1.x/types/spec';
import type { OpenApi } from '../../types';
import type { ResourceMetadata } from '../graph/meta';
import { httpMethods } from './operation';

type FilterNamespace =
  | 'body'
  | 'operation'
  | 'parameter'
  | 'response'
  | 'schema'
  | 'unknown';

const namespaceNeedle = '/';

export const addNamespace = (
  namespace: FilterNamespace,
  value: string = '',
): string => `${namespace}${namespaceNeedle}${value}`;

export const removeNamespace = (
  key: string,
): {
  name: string;
  namespace: FilterNamespace;
} => {
  const index = key.indexOf(namespaceNeedle);
  const name = key.slice(index + 1);
  return {
    name,
    namespace: key.slice(0, index)! as FilterNamespace,
  };
};

/**
 * Converts reference strings from OpenAPI $ref keywords into namespaces.
 *
 * @example '#/components/schemas/Foo' -> 'schema'
 */
export const stringToNamespace = (value: string): FilterNamespace => {
  switch (value) {
    case 'parameters':
      return 'parameter';
    case 'requestBodies':
      return 'body';
    case 'responses':
      return 'response';
    case 'definitions':
    case 'schemas':
      return 'schema';
    default:
      return 'unknown';
  }
};

type FiltersConfigToState<T> = {
  [K in keyof T]-?: NonNullable<T[K]> extends ReadonlyArray<infer U>
    ? Set<U>
    : NonNullable<T[K]> extends object
      ? FiltersConfigToState<NonNullable<T[K]>>
      : T[K];
};

export type Filters = FiltersConfigToState<
  NonNullable<Config['parser']['filters']>
>;

interface SetAndRegExps {
  regexps: Array<RegExp>;
  set: Set<string>;
}

const createFiltersSetAndRegExps = (
  type: FilterNamespace,
  filters: ReadonlyArray<string> | undefined,
): SetAndRegExps => {
  const keys: Array<string> = [];
  const regexps: Array<RegExp> = [];
  if (filters) {
    for (const value of filters) {
      if (value.startsWith('/') && value.endsWith('/')) {
        regexps.push(new RegExp(value.slice(1, value.length - 1)));
      } else {
        keys.push(addNamespace(type, value));
      }
    }
  }
  return {
    regexps,
    set: new Set(keys),
  };
};

interface CollectFiltersSetFromRegExps {
  excludeOperations: SetAndRegExps;
  excludeParameters: SetAndRegExps;
  excludeRequestBodies: SetAndRegExps;
  excludeResponses: SetAndRegExps;
  excludeSchemas: SetAndRegExps;
  includeOperations: SetAndRegExps;
  includeParameters: SetAndRegExps;
  includeRequestBodies: SetAndRegExps;
  includeResponses: SetAndRegExps;
  includeSchemas: SetAndRegExps;
}

const collectFiltersSetFromRegExpsOpenApiV2 = ({
  excludeOperations,
  excludeSchemas,
  includeOperations,
  includeSchemas,
  spec,
}: CollectFiltersSetFromRegExps & {
  spec: OpenApi.V2_0_X;
}) => {
  if (
    (excludeOperations.regexps.length || includeOperations.regexps.length) &&
    spec.paths
  ) {
    for (const entry of Object.entries(spec.paths)) {
      const path = entry[0] as keyof PathsObject;
      const pathItem = entry[1] as PathItemObject;
      for (const method of httpMethods) {
        const operation = pathItem[method];
        if (!operation) {
          continue;
        }

        const key = createOperationKey({ method, path });
        if (excludeOperations.regexps.some((regexp) => regexp.test(key))) {
          excludeOperations.set.add(addNamespace('operation', key));
        }
        if (includeOperations.regexps.some((regexp) => regexp.test(key))) {
          includeOperations.set.add(addNamespace('operation', key));
        }
      }
    }
  }

  if (spec.definitions) {
    // TODO: add parameters

    if (excludeSchemas.regexps.length || includeSchemas.regexps.length) {
      for (const key of Object.keys(spec.definitions)) {
        if (excludeSchemas.regexps.some((regexp) => regexp.test(key))) {
          excludeSchemas.set.add(addNamespace('schema', key));
        }
        if (includeSchemas.regexps.some((regexp) => regexp.test(key))) {
          includeSchemas.set.add(addNamespace('schema', key));
        }
      }
    }
  }
};

const collectFiltersSetFromRegExpsOpenApiV3 = ({
  excludeOperations,
  excludeParameters,
  excludeRequestBodies,
  excludeResponses,
  excludeSchemas,
  includeOperations,
  includeParameters,
  includeRequestBodies,
  includeResponses,
  includeSchemas,
  spec,
}: CollectFiltersSetFromRegExps & {
  spec: OpenApi.V3_0_X | OpenApi.V3_1_X;
}) => {
  if (
    (excludeOperations.regexps.length || includeOperations.regexps.length) &&
    spec.paths
  ) {
    for (const entry of Object.entries(spec.paths)) {
      const path = entry[0] as keyof PathsObject;
      const pathItem = entry[1] as PathItemObject;
      for (const method of httpMethods) {
        const operation = pathItem[method];
        if (!operation) {
          continue;
        }

        const key = createOperationKey({ method, path });
        if (excludeOperations.regexps.some((regexp) => regexp.test(key))) {
          excludeOperations.set.add(addNamespace('operation', key));
        }
        if (includeOperations.regexps.some((regexp) => regexp.test(key))) {
          includeOperations.set.add(addNamespace('operation', key));
        }
      }
    }
  }

  if (spec.components) {
    if (
      (excludeParameters.regexps.length || includeParameters.regexps.length) &&
      spec.components.parameters
    ) {
      for (const key of Object.keys(spec.components.parameters)) {
        if (excludeParameters.regexps.some((regexp) => regexp.test(key))) {
          excludeParameters.set.add(addNamespace('parameter', key));
        }
        if (includeParameters.regexps.some((regexp) => regexp.test(key))) {
          includeParameters.set.add(addNamespace('parameter', key));
        }
      }
    }

    if (
      (excludeRequestBodies.regexps.length ||
        includeRequestBodies.regexps.length) &&
      spec.components.requestBodies
    ) {
      for (const key of Object.keys(spec.components.requestBodies)) {
        if (excludeRequestBodies.regexps.some((regexp) => regexp.test(key))) {
          excludeRequestBodies.set.add(addNamespace('body', key));
        }
        if (includeRequestBodies.regexps.some((regexp) => regexp.test(key))) {
          includeRequestBodies.set.add(addNamespace('body', key));
        }
      }
    }

    if (
      (excludeResponses.regexps.length || includeResponses.regexps.length) &&
      spec.components.responses
    ) {
      for (const key of Object.keys(spec.components.responses)) {
        if (excludeResponses.regexps.some((regexp) => regexp.test(key))) {
          excludeResponses.set.add(addNamespace('response', key));
        }
        if (includeResponses.regexps.some((regexp) => regexp.test(key))) {
          includeResponses.set.add(addNamespace('response', key));
        }
      }
    }

    if (
      (excludeSchemas.regexps.length || includeSchemas.regexps.length) &&
      spec.components.schemas
    ) {
      for (const key of Object.keys(spec.components.schemas)) {
        if (excludeSchemas.regexps.some((regexp) => regexp.test(key))) {
          excludeSchemas.set.add(addNamespace('schema', key));
        }
        if (includeSchemas.regexps.some((regexp) => regexp.test(key))) {
          includeSchemas.set.add(addNamespace('schema', key));
        }
      }
    }
  }
};

const collectFiltersSetFromRegExps = ({
  spec,
  ...filters
}: CollectFiltersSetFromRegExps & {
  spec: OpenApi.V2_0_X | OpenApi.V3_0_X | OpenApi.V3_1_X;
}): void => {
  if ('swagger' in spec) {
    collectFiltersSetFromRegExpsOpenApiV2({ ...filters, spec });
  } else {
    collectFiltersSetFromRegExpsOpenApiV3({ ...filters, spec });
  }
};

export const createFilters = (
  config: Config['parser']['filters'],
  spec: OpenApi.V2_0_X | OpenApi.V3_0_X | OpenApi.V3_1_X,
  logger: Logger,
): Filters => {
  const eventCreateFilters = logger.timeEvent('create-filters');
  const excludeOperations = createFiltersSetAndRegExps(
    'operation',
    config?.operations?.exclude,
  );
  const includeOperations = createFiltersSetAndRegExps(
    'operation',
    config?.operations?.include,
  );
  const excludeParameters = createFiltersSetAndRegExps(
    'parameter',
    config?.parameters?.exclude,
  );
  const includeParameters = createFiltersSetAndRegExps(
    'parameter',
    config?.parameters?.include,
  );
  const excludeRequestBodies = createFiltersSetAndRegExps(
    'body',
    config?.requestBodies?.exclude,
  );
  const includeRequestBodies = createFiltersSetAndRegExps(
    'body',
    config?.requestBodies?.include,
  );
  const excludeResponses = createFiltersSetAndRegExps(
    'response',
    config?.responses?.exclude,
  );
  const includeResponses = createFiltersSetAndRegExps(
    'response',
    config?.responses?.include,
  );
  const excludeSchemas = createFiltersSetAndRegExps(
    'schema',
    config?.schemas?.exclude,
  );
  const includeSchemas = createFiltersSetAndRegExps(
    'schema',
    config?.schemas?.include,
  );

  collectFiltersSetFromRegExps({
    excludeOperations,
    excludeParameters,
    excludeRequestBodies,
    excludeResponses,
    excludeSchemas,
    includeOperations,
    includeParameters,
    includeRequestBodies,
    includeResponses,
    includeSchemas,
    spec,
  });

  const filters: Filters = {
    deprecated: config?.deprecated ?? true,
    operations: {
      exclude: excludeOperations.set,
      include: includeOperations.set,
    },
    orphans: config?.orphans ?? false,
    parameters: {
      exclude: excludeParameters.set,
      include: includeParameters.set,
    },
    preserveOrder: config?.preserveOrder ?? false,
    requestBodies: {
      exclude: excludeRequestBodies.set,
      include: includeRequestBodies.set,
    },
    responses: {
      exclude: excludeResponses.set,
      include: includeResponses.set,
    },
    schemas: {
      exclude: excludeSchemas.set,
      include: includeSchemas.set,
    },
    tags: {
      exclude: new Set(config?.tags?.exclude),
      include: new Set(config?.tags?.include),
    },
  };
  eventCreateFilters.timeEnd();
  return filters;
};

export const hasFilters = (config: Config['parser']['filters']): boolean => {
  if (!config) {
    return false;
  }

  // we explicitly want to strip orphans or deprecated
  if (config.orphans === false || config.deprecated === false) {
    return true;
  }

  return Boolean(
    config.operations?.exclude?.length ||
      config.operations?.include?.length ||
      config.parameters?.exclude?.length ||
      config.parameters?.include?.length ||
      config.requestBodies?.exclude?.length ||
      config.requestBodies?.include?.length ||
      config.responses?.exclude?.length ||
      config.responses?.include?.length ||
      config.schemas?.exclude?.length ||
      config.schemas?.include?.length ||
      config.tags?.exclude?.length ||
      config.tags?.include?.length,
  );
};

/**
 * Collect operations that satisfy the include/exclude filters and schema dependencies.
 */
const collectOperations = ({
  filters,
  parameters,
  requestBodies,
  resourceMetadata,
  responses,
  schemas,
}: {
  filters: Filters;
  parameters: Set<string>;
  requestBodies: Set<string>;
  resourceMetadata: ResourceMetadata;
  responses: Set<string>;
  schemas: Set<string>;
}): {
  operations: Set<string>;
} => {
  const finalSet = new Set<string>();
  const initialSet = filters.operations.include.size
    ? filters.operations.include
    : new Set(resourceMetadata.operations.keys());
  const stack = [...initialSet];
  while (stack.length) {
    const key = stack.pop()!;

    if (filters.operations.exclude.has(key) || finalSet.has(key)) {
      continue;
    }

    const node = resourceMetadata.operations.get(key);

    if (!node) {
      continue;
    }

    if (!filters.deprecated && node.deprecated) {
      continue;
    }

    if (
      filters.tags.exclude.size &&
      node.tags.size &&
      [...filters.tags.exclude].some((tag) => node.tags.has(tag))
    ) {
      continue;
    }

    if (
      filters.tags.include.size &&
      !new Set([...filters.tags.include].filter((tag) => node.tags.has(tag)))
        .size
    ) {
      continue;
    }

    // skip operation if it references any component not included
    if (
      [...node.dependencies].some((dependency) => {
        const { namespace } = removeNamespace(dependency);
        switch (namespace) {
          case 'body':
            return !requestBodies.has(dependency);
          case 'parameter':
            return !parameters.has(dependency);
          case 'response':
            return !responses.has(dependency);
          case 'schema':
            return !schemas.has(dependency);
          default:
            return false;
        }
      })
    ) {
      continue;
    }

    finalSet.add(key);
  }
  return { operations: finalSet };
};

/**
 * Collect parameters that satisfy the include/exclude filters and schema dependencies.
 */
const collectParameters = ({
  filters,
  resourceMetadata,
  schemas,
}: {
  filters: Filters;
  resourceMetadata: ResourceMetadata;
  schemas: Set<string>;
}): {
  parameters: Set<string>;
} => {
  const finalSet = new Set<string>();
  const initialSet = filters.parameters.include.size
    ? filters.parameters.include
    : new Set(resourceMetadata.parameters.keys());
  const stack = [...initialSet];
  while (stack.length) {
    const key = stack.pop()!;

    if (filters.parameters.exclude.has(key) || finalSet.has(key)) {
      continue;
    }

    const node = resourceMetadata.parameters.get(key);

    if (!node) {
      continue;
    }

    if (!filters.deprecated && node.deprecated) {
      continue;
    }

    finalSet.add(key);

    if (!node.dependencies.size) {
      continue;
    }

    for (const dependency of node.dependencies) {
      const { namespace } = removeNamespace(dependency);
      switch (namespace) {
        case 'body': {
          if (filters.requestBodies.exclude.has(dependency)) {
            finalSet.delete(key);
          } else if (!finalSet.has(dependency)) {
            stack.push(dependency);
          }
          break;
        }
        case 'schema': {
          if (filters.schemas.exclude.has(dependency)) {
            finalSet.delete(key);
          } else if (!schemas.has(dependency)) {
            schemas.add(dependency);
          }
          break;
        }
      }
    }
  }
  return { parameters: finalSet };
};

/**
 * Collect request bodies that satisfy the include/exclude filters and schema dependencies.
 */
const collectRequestBodies = ({
  filters,
  resourceMetadata,
  schemas,
}: {
  filters: Filters;
  resourceMetadata: ResourceMetadata;
  schemas: Set<string>;
}): {
  requestBodies: Set<string>;
} => {
  const finalSet = new Set<string>();
  const initialSet = filters.requestBodies.include.size
    ? filters.requestBodies.include
    : new Set(resourceMetadata.requestBodies.keys());
  const stack = [...initialSet];
  while (stack.length) {
    const key = stack.pop()!;

    if (filters.requestBodies.exclude.has(key) || finalSet.has(key)) {
      continue;
    }

    const node = resourceMetadata.requestBodies.get(key);

    if (!node) {
      continue;
    }

    if (!filters.deprecated && node.deprecated) {
      continue;
    }

    finalSet.add(key);

    if (!node.dependencies.size) {
      continue;
    }

    for (const dependency of node.dependencies) {
      const { namespace } = removeNamespace(dependency);
      switch (namespace) {
        case 'body': {
          if (filters.requestBodies.exclude.has(dependency)) {
            finalSet.delete(key);
          } else if (!finalSet.has(dependency)) {
            stack.push(dependency);
          }
          break;
        }
        case 'schema': {
          if (filters.schemas.exclude.has(dependency)) {
            finalSet.delete(key);
          } else if (!schemas.has(dependency)) {
            schemas.add(dependency);
          }
          break;
        }
      }
    }
  }
  return { requestBodies: finalSet };
};

/**
 * Collect responses that satisfy the include/exclude filters and schema dependencies.
 */
const collectResponses = ({
  filters,
  resourceMetadata,
  schemas,
}: {
  filters: Filters;
  resourceMetadata: ResourceMetadata;
  schemas: Set<string>;
}): {
  responses: Set<string>;
} => {
  const finalSet = new Set<string>();
  const initialSet = filters.responses.include.size
    ? filters.responses.include
    : new Set(resourceMetadata.responses.keys());
  const stack = [...initialSet];
  while (stack.length) {
    const key = stack.pop()!;

    if (filters.responses.exclude.has(key) || finalSet.has(key)) {
      continue;
    }

    const node = resourceMetadata.responses.get(key);

    if (!node) {
      continue;
    }

    if (!filters.deprecated && node.deprecated) {
      continue;
    }

    finalSet.add(key);

    if (!node.dependencies.size) {
      continue;
    }

    for (const dependency of node.dependencies) {
      const { namespace } = removeNamespace(dependency);
      switch (namespace) {
        case 'body': {
          if (filters.requestBodies.exclude.has(dependency)) {
            finalSet.delete(key);
          } else if (!finalSet.has(dependency)) {
            stack.push(dependency);
          }
          break;
        }
        case 'schema': {
          if (filters.schemas.exclude.has(dependency)) {
            finalSet.delete(key);
          } else if (!schemas.has(dependency)) {
            schemas.add(dependency);
          }
          break;
        }
      }
    }
  }
  return { responses: finalSet };
};

/**
 * Collect schemas that satisfy the include/exclude filters.
 */
const collectSchemas = ({
  filters,
  resourceMetadata,
}: {
  filters: Filters;
  resourceMetadata: ResourceMetadata;
}): {
  schemas: Set<string>;
} => {
  const finalSet = new Set<string>();
  const initialSet = filters.schemas.include.size
    ? filters.schemas.include
    : new Set(resourceMetadata.schemas.keys());
  const stack = [...initialSet];
  while (stack.length) {
    const key = stack.pop()!;

    if (filters.schemas.exclude.has(key) || finalSet.has(key)) {
      continue;
    }

    const node = resourceMetadata.schemas.get(key);

    if (!node) {
      continue;
    }

    if (!filters.deprecated && node.deprecated) {
      continue;
    }

    finalSet.add(key);

    if (!node.dependencies.size) {
      continue;
    }

    for (const dependency of node.dependencies) {
      const { namespace } = removeNamespace(dependency);
      switch (namespace) {
        case 'schema': {
          if (
            !finalSet.has(dependency) &&
            !filters.schemas.exclude.has(dependency)
          ) {
            stack.push(dependency);
          }
          break;
        }
      }
    }
  }
  return { schemas: finalSet };
};

/**
 * Drop parameters that depend on already excluded parameters.
 */
const dropExcludedParameters = ({
  filters,
  parameters,
  resourceMetadata,
}: {
  filters: Filters;
  parameters: Set<string>;
  resourceMetadata: ResourceMetadata;
}): void => {
  if (!filters.parameters.exclude.size) {
    return;
  }

  for (const key of parameters) {
    const node = resourceMetadata.parameters.get(key);

    if (!node?.dependencies.size) {
      continue;
    }

    for (const excludedKey of filters.parameters.exclude) {
      if (node.dependencies.has(excludedKey)) {
        parameters.delete(key);
        break;
      }
    }
  }
};

/**
 * Drop request bodies that depend on already excluded request bodies.
 */
const dropExcludedRequestBodies = ({
  filters,
  requestBodies,
  resourceMetadata,
}: {
  filters: Filters;
  requestBodies: Set<string>;
  resourceMetadata: ResourceMetadata;
}): void => {
  if (!filters.requestBodies.exclude.size) {
    return;
  }

  for (const key of requestBodies) {
    const node = resourceMetadata.requestBodies.get(key);

    if (!node?.dependencies.size) {
      continue;
    }

    for (const excludedKey of filters.requestBodies.exclude) {
      if (node.dependencies.has(excludedKey)) {
        requestBodies.delete(key);
        break;
      }
    }
  }
};

/**
 * Drop responses that depend on already excluded responses.
 */
const dropExcludedResponses = ({
  filters,
  resourceMetadata,
  responses,
}: {
  filters: Filters;
  resourceMetadata: ResourceMetadata;
  responses: Set<string>;
}): void => {
  if (!filters.responses.exclude.size) {
    return;
  }

  for (const key of responses) {
    const node = resourceMetadata.responses.get(key);

    if (!node?.dependencies.size) {
      continue;
    }

    for (const excludedKey of filters.responses.exclude) {
      if (node.dependencies.has(excludedKey)) {
        responses.delete(key);
        break;
      }
    }
  }
};

/**
 * Drop schemas that depend on already excluded schemas.
 */
const dropExcludedSchemas = ({
  filters,
  resourceMetadata,
  schemas,
}: {
  filters: Filters;
  resourceMetadata: ResourceMetadata;
  schemas: Set<string>;
}): void => {
  if (!filters.schemas.exclude.size) {
    return;
  }

  for (const key of schemas) {
    const node = resourceMetadata.schemas.get(key);

    if (!node?.dependencies.size) {
      continue;
    }

    for (const excludedKey of filters.schemas.exclude) {
      if (node.dependencies.has(excludedKey)) {
        schemas.delete(key);
        break;
      }
    }
  }
};

const dropOrphans = ({
  operationDependencies,
  parameters,
  requestBodies,
  responses,
  schemas,
}: {
  operationDependencies: Set<string>;
  parameters: Set<string>;
  requestBodies: Set<string>;
  responses: Set<string>;
  schemas: Set<string>;
}) => {
  for (const key of schemas) {
    if (!operationDependencies.has(key)) {
      schemas.delete(key);
    }
  }
  for (const key of parameters) {
    if (!operationDependencies.has(key)) {
      parameters.delete(key);
    }
  }
  for (const key of requestBodies) {
    if (!operationDependencies.has(key)) {
      requestBodies.delete(key);
    }
  }
  for (const key of responses) {
    if (!operationDependencies.has(key)) {
      responses.delete(key);
    }
  }
};

const collectOperationDependencies = ({
  operations,
  resourceMetadata,
}: {
  operations: Set<string>;
  resourceMetadata: ResourceMetadata;
}): {
  operationDependencies: Set<string>;
} => {
  const finalSet = new Set<string>();
  const initialSet = new Set(
    [...operations].flatMap((key) => [
      ...(resourceMetadata.operations.get(key)?.dependencies ?? []),
    ]),
  );
  const stack = [...initialSet];
  while (stack.length) {
    const key = stack.pop()!;

    if (finalSet.has(key)) {
      continue;
    }

    finalSet.add(key);

    const { namespace } = removeNamespace(key);
    let dependencies: Set<string> | undefined;
    if (namespace === 'body') {
      dependencies = resourceMetadata.requestBodies.get(key)?.dependencies;
    } else if (namespace === 'operation') {
      dependencies = resourceMetadata.operations.get(key)?.dependencies;
    } else if (namespace === 'parameter') {
      dependencies = resourceMetadata.parameters.get(key)?.dependencies;
    } else if (namespace === 'response') {
      dependencies = resourceMetadata.responses.get(key)?.dependencies;
    } else if (namespace === 'schema') {
      dependencies = resourceMetadata.schemas.get(key)?.dependencies;
    }

    if (!dependencies?.size) {
      continue;
    }

    for (const dependency of dependencies) {
      if (!finalSet.has(dependency)) {
        stack.push(dependency);
      }
    }
  }
  return { operationDependencies: finalSet };
};

export const createFilteredDependencies = ({
  filters,
  logger,
  resourceMetadata,
}: {
  filters: Filters;
  logger: Logger;
  resourceMetadata: ResourceMetadata;
}): {
  operations: Set<string>;
  parameters: Set<string>;
  requestBodies: Set<string>;
  responses: Set<string>;
  schemas: Set<string>;
} => {
  const eventCreateFilteredDependencies = logger.timeEvent(
    'create-filtered-dependencies',
  );
  const { schemas } = collectSchemas({ filters, resourceMetadata });
  const { parameters } = collectParameters({
    filters,
    resourceMetadata,
    schemas,
  });
  const { requestBodies } = collectRequestBodies({
    filters,
    resourceMetadata,
    schemas,
  });
  const { responses } = collectResponses({
    filters,
    resourceMetadata,
    schemas,
  });

  dropExcludedSchemas({ filters, resourceMetadata, schemas });
  dropExcludedParameters({ filters, parameters, resourceMetadata });
  dropExcludedRequestBodies({ filters, requestBodies, resourceMetadata });
  dropExcludedResponses({ filters, resourceMetadata, responses });

  // collect operations after dropping components
  const { operations } = collectOperations({
    filters,
    parameters,
    requestBodies,
    resourceMetadata,
    responses,
    schemas,
  });

  if (!filters.orphans && operations.size) {
    const { operationDependencies } = collectOperationDependencies({
      operations,
      resourceMetadata,
    });
    dropOrphans({
      operationDependencies,
      parameters,
      requestBodies,
      responses,
      schemas,
    });
  }

  eventCreateFilteredDependencies.timeEnd();
  return {
    operations,
    parameters,
    requestBodies,
    responses,
    schemas,
  };
};
