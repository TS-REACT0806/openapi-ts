import ts from 'typescript';

import { compiler } from '../../compiler';
import type { Identifier } from '../../generate/files';
import { operationResponsesMap } from '../../ir/operation';
import { hasParameterGroupObjectRequired } from '../../ir/parameter';
import { deduplicateSchema } from '../../ir/schema';
import type { IR } from '../../ir/types';
import type { StringCase } from '../../types/config';
import { numberRegExp } from '../../utils/regexp';
import { createSchemaComment } from '../shared/utils/schema';
import type { Plugin } from '../types';
import type { ResolvedConfig } from './types';

interface SchemaWithType<T extends Required<IR.SchemaObject>['type']>
  extends Omit<IR.SchemaObject, 'type'> {
  type: Extract<Required<IR.SchemaObject>['type'], T>;
}

interface State {
  circularReferenceTracker: Set<string>;
  hasCircularReference: boolean;
  nameCase: StringCase;
  nameTransformer: string | ((name: string) => string);
}

export const zodId = 'zod';

// frequently used identifiers
const andIdentifier = compiler.identifier({ text: 'and' });
const arrayIdentifier = compiler.identifier({ text: 'array' });
const coerceIdentifier = compiler.identifier({ text: 'coerce' });
const defaultIdentifier = compiler.identifier({ text: 'default' });
const describeIdentifier = compiler.identifier({ text: 'describe' });
const intersectionIdentifier = compiler.identifier({ text: 'intersection' });
const lazyIdentifier = compiler.identifier({ text: 'lazy' });
const lengthIdentifier = compiler.identifier({ text: 'length' });
const literalIdentifier = compiler.identifier({ text: 'literal' });
const maxIdentifier = compiler.identifier({ text: 'max' });
const minIdentifier = compiler.identifier({ text: 'min' });
const objectIdentifier = compiler.identifier({ text: 'object' });
const optionalIdentifier = compiler.identifier({ text: 'optional' });
const readonlyIdentifier = compiler.identifier({ text: 'readonly' });
const regexIdentifier = compiler.identifier({ text: 'regex' });
const unionIdentifier = compiler.identifier({ text: 'union' });
const zIdentifier = compiler.identifier({ text: 'z' });

const arrayTypeToZodSchema = ({
  context,
  plugin,
  schema,
  state,
}: {
  context: IR.Context;
  plugin: Plugin.Instance<ResolvedConfig>;
  schema: SchemaWithType<'array'>;
  state: State;
}): ts.CallExpression => {
  const functionName = compiler.propertyAccessExpression({
    expression: zIdentifier,
    name: arrayIdentifier,
  });

  let arrayExpression: ts.CallExpression | undefined;

  if (!schema.items) {
    arrayExpression = compiler.callExpression({
      functionName,
      parameters: [
        unknownTypeToZodSchema({
          context,
          schema: {
            type: 'unknown',
          },
        }),
      ],
    });
  } else {
    schema = deduplicateSchema({ schema });

    // at least one item is guaranteed
    const itemExpressions = schema.items!.map((item) =>
      schemaToZodSchema({
        plugin,
        schema: item,
        state,
      }),
    );

    if (itemExpressions.length === 1) {
      arrayExpression = compiler.callExpression({
        functionName,
        parameters: itemExpressions,
      });
    } else {
      if (schema.logicalOperator === 'and') {
        // TODO: parser - handle intersection
        // return compiler.typeArrayNode(
        //   compiler.typeIntersectionNode({ types: itemExpressions }),
        // );
      }

      arrayExpression = compiler.callExpression({
        functionName: compiler.propertyAccessExpression({
          expression: zIdentifier,
          name: arrayIdentifier,
        }),
        parameters: [
          compiler.callExpression({
            functionName: compiler.propertyAccessExpression({
              expression: zIdentifier,
              name: unionIdentifier,
            }),
            parameters: [
              compiler.arrayLiteralExpression({
                elements: itemExpressions,
              }),
            ],
          }),
        ],
      });
    }
  }

  if (schema.minItems === schema.maxItems && schema.minItems !== undefined) {
    arrayExpression = compiler.callExpression({
      functionName: compiler.propertyAccessExpression({
        expression: arrayExpression,
        name: lengthIdentifier,
      }),
      parameters: [compiler.valueToExpression({ value: schema.minItems })],
    });
  } else {
    if (schema.minItems !== undefined) {
      arrayExpression = compiler.callExpression({
        functionName: compiler.propertyAccessExpression({
          expression: arrayExpression,
          name: minIdentifier,
        }),
        parameters: [compiler.valueToExpression({ value: schema.minItems })],
      });
    }

    if (schema.maxItems !== undefined) {
      arrayExpression = compiler.callExpression({
        functionName: compiler.propertyAccessExpression({
          expression: arrayExpression,
          name: maxIdentifier,
        }),
        parameters: [compiler.valueToExpression({ value: schema.maxItems })],
      });
    }
  }

  return arrayExpression;
};

const booleanTypeToZodSchema = ({
  schema,
}: {
  context: IR.Context;
  schema: SchemaWithType<'boolean'>;
}) => {
  if (typeof schema.const === 'boolean') {
    const expression = compiler.callExpression({
      functionName: compiler.propertyAccessExpression({
        expression: zIdentifier,
        name: literalIdentifier,
      }),
      parameters: [compiler.ots.boolean(schema.const)],
    });
    return expression;
  }

  const expression = compiler.callExpression({
    functionName: compiler.propertyAccessExpression({
      expression: zIdentifier,
      name: compiler.identifier({ text: 'boolean' }),
    }),
  });
  return expression;
};

const enumTypeToZodSchema = ({
  context,
  schema,
}: {
  context: IR.Context;
  schema: SchemaWithType<'enum'>;
}): ts.CallExpression => {
  const enumMembers: Array<ts.LiteralExpression> = [];

  let isNullable = false;

  for (const item of schema.items ?? []) {
    // Zod supports only string enums
    if (item.type === 'string' && typeof item.const === 'string') {
      enumMembers.push(
        compiler.stringLiteral({
          text: item.const,
        }),
      );
    } else if (item.type === 'null' || item.const === null) {
      isNullable = true;
    }
  }

  if (!enumMembers.length) {
    return unknownTypeToZodSchema({
      context,
      schema: {
        type: 'unknown',
      },
    });
  }

  let enumExpression = compiler.callExpression({
    functionName: compiler.propertyAccessExpression({
      expression: zIdentifier,
      name: compiler.identifier({ text: 'enum' }),
    }),
    parameters: [
      compiler.arrayLiteralExpression({
        elements: enumMembers,
        multiLine: false,
      }),
    ],
  });

  if (isNullable) {
    enumExpression = compiler.callExpression({
      functionName: compiler.propertyAccessExpression({
        expression: enumExpression,
        name: compiler.identifier({ text: 'nullable' }),
      }),
    });
  }

  return enumExpression;
};

const neverTypeToZodSchema = ({
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  schema,
}: {
  context: IR.Context;
  schema: SchemaWithType<'never'>;
}) => {
  const expression = compiler.callExpression({
    functionName: compiler.propertyAccessExpression({
      expression: zIdentifier,
      name: compiler.identifier({ text: 'never' }),
    }),
  });
  return expression;
};

const nullTypeToZodSchema = ({
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  schema,
}: {
  context: IR.Context;
  schema: SchemaWithType<'null'>;
}) => {
  const expression = compiler.callExpression({
    functionName: compiler.propertyAccessExpression({
      expression: zIdentifier,
      name: compiler.identifier({ text: 'null' }),
    }),
  });
  return expression;
};

const numberParameter = ({
  isBigInt,
  value,
}: {
  isBigInt: boolean;
  value: unknown;
}) => {
  const expression = compiler.valueToExpression({ value });

  if (
    isBigInt &&
    (typeof value === 'bigint' ||
      typeof value === 'number' ||
      typeof value === 'string' ||
      typeof value === 'boolean')
  ) {
    return compiler.callExpression({
      functionName: 'BigInt',
      parameters: [expression],
    });
  }

  return expression;
};

const numberTypeToZodSchema = ({
  schema,
}: {
  context: IR.Context;
  schema: SchemaWithType<'integer' | 'number'>;
}) => {
  const isBigInt = schema.type === 'integer' && schema.format === 'int64';

  if (typeof schema.const === 'number') {
    // TODO: parser - handle bigint constants
    const expression = compiler.callExpression({
      functionName: compiler.propertyAccessExpression({
        expression: zIdentifier,
        name: literalIdentifier,
      }),
      parameters: [compiler.ots.number(schema.const)],
    });
    return expression;
  }

  let numberExpression = compiler.callExpression({
    functionName: isBigInt
      ? compiler.propertyAccessExpression({
          expression: compiler.propertyAccessExpression({
            expression: zIdentifier,
            name: coerceIdentifier,
          }),
          name: compiler.identifier({ text: 'bigint' }),
        })
      : compiler.propertyAccessExpression({
          expression: zIdentifier,
          name: compiler.identifier({ text: 'number' }),
        }),
  });

  if (!isBigInt && schema.type === 'integer') {
    numberExpression = compiler.callExpression({
      functionName: compiler.propertyAccessExpression({
        expression: numberExpression,
        name: compiler.identifier({ text: 'int' }),
      }),
    });
  }

  if (schema.exclusiveMinimum !== undefined) {
    numberExpression = compiler.callExpression({
      functionName: compiler.propertyAccessExpression({
        expression: numberExpression,
        name: compiler.identifier({ text: 'gt' }),
      }),
      parameters: [
        numberParameter({ isBigInt, value: schema.exclusiveMinimum }),
      ],
    });
  } else if (schema.minimum !== undefined) {
    numberExpression = compiler.callExpression({
      functionName: compiler.propertyAccessExpression({
        expression: numberExpression,
        name: compiler.identifier({ text: 'gte' }),
      }),
      parameters: [numberParameter({ isBigInt, value: schema.minimum })],
    });
  }

  if (schema.exclusiveMaximum !== undefined) {
    numberExpression = compiler.callExpression({
      functionName: compiler.propertyAccessExpression({
        expression: numberExpression,
        name: compiler.identifier({ text: 'lt' }),
      }),
      parameters: [
        numberParameter({ isBigInt, value: schema.exclusiveMaximum }),
      ],
    });
  } else if (schema.maximum !== undefined) {
    numberExpression = compiler.callExpression({
      functionName: compiler.propertyAccessExpression({
        expression: numberExpression,
        name: compiler.identifier({ text: 'lte' }),
      }),
      parameters: [numberParameter({ isBigInt, value: schema.maximum })],
    });
  }

  return numberExpression;
};

const objectTypeToZodSchema = ({
  plugin,
  schema,
  state,
}: {
  plugin: Plugin.Instance<ResolvedConfig>;
  schema: SchemaWithType<'object'>;
  state: State;
}): {
  anyType: string;
  expression: ts.CallExpression;
} => {
  // TODO: parser - handle constants
  const properties: Array<ts.PropertyAssignment> = [];

  // let indexProperty: Property | undefined;
  // const schemaProperties: Array<Property> = [];
  // let indexPropertyItems: Array<IR.SchemaObject> = [];
  const required = schema.required ?? [];
  // let hasOptionalProperties = false;

  for (const name in schema.properties) {
    const property = schema.properties[name]!;
    const isRequired = required.includes(name);

    const propertyExpression = schemaToZodSchema({
      optional: !isRequired,
      plugin,
      schema: property,
      state,
    });

    numberRegExp.lastIndex = 0;
    let propertyName;
    if (numberRegExp.test(name)) {
      // For numeric literals, we'll handle negative numbers by using a string literal
      // instead of trying to use a PrefixUnaryExpression
      propertyName = name.startsWith('-')
        ? ts.factory.createStringLiteral(name)
        : ts.factory.createNumericLiteral(name);
    } else {
      propertyName = name;
    }
    // TODO: parser - abstract safe property name logic
    if (
      ((name.match(/^[0-9]/) && name.match(/\D+/g)) || name.match(/\W/g)) &&
      !name.startsWith("'") &&
      !name.endsWith("'")
    ) {
      propertyName = `'${name}'`;
    }
    properties.push(
      compiler.propertyAssignment({
        initializer: propertyExpression,
        name: propertyName,
      }),
    );

    // indexPropertyItems.push(property);
    // if (!isRequired) {
    //   hasOptionalProperties = true;
    // }
  }

  // if (
  //   schema.additionalProperties &&
  //   (schema.additionalProperties.type !== 'never' || !indexPropertyItems.length)
  // ) {
  //   if (schema.additionalProperties.type === 'never') {
  //     indexPropertyItems = [schema.additionalProperties];
  //   } else {
  //     indexPropertyItems.unshift(schema.additionalProperties);
  //   }

  //   if (hasOptionalProperties) {
  //     indexPropertyItems.push({
  //       type: 'undefined',
  //     });
  //   }

  //   indexProperty = {
  //     isRequired: true,
  //     name: 'key',
  //     type: schemaToZodSchema({
  //       schema:
  //         indexPropertyItems.length === 1
  //           ? indexPropertyItems[0]
  //           : {
  //               items: indexPropertyItems,
  //               logicalOperator: 'or',
  //             },
  //     }),
  //   };
  // }

  // return compiler.typeInterfaceNode({
  //   indexProperty,
  //   properties: schemaProperties,
  //   useLegacyResolution: false,
  // });
  const expression = compiler.callExpression({
    functionName: compiler.propertyAccessExpression({
      expression: zIdentifier,
      name: objectIdentifier,
    }),
    parameters: [ts.factory.createObjectLiteralExpression(properties, true)],
  });
  return {
    anyType: 'AnyZodObject',
    expression,
  };
};

const stringTypeToZodSchema = ({
  schema,
}: {
  context: IR.Context;
  schema: SchemaWithType<'string'>;
}) => {
  if (typeof schema.const === 'string') {
    const expression = compiler.callExpression({
      functionName: compiler.propertyAccessExpression({
        expression: zIdentifier,
        name: literalIdentifier,
      }),
      parameters: [compiler.ots.string(schema.const)],
    });
    return expression;
  }

  let stringExpression = compiler.callExpression({
    functionName: compiler.propertyAccessExpression({
      expression: zIdentifier,
      name: compiler.identifier({ text: 'string' }),
    }),
  });

  if (schema.format) {
    switch (schema.format) {
      case 'date-time':
        stringExpression = compiler.callExpression({
          functionName: compiler.propertyAccessExpression({
            expression: stringExpression,
            name: compiler.identifier({ text: 'datetime' }),
          }),
        });
        break;
      case 'ipv4':
      case 'ipv6':
        stringExpression = compiler.callExpression({
          functionName: compiler.propertyAccessExpression({
            expression: stringExpression,
            name: compiler.identifier({ text: 'ip' }),
          }),
        });
        break;
      case 'uri':
        stringExpression = compiler.callExpression({
          functionName: compiler.propertyAccessExpression({
            expression: stringExpression,
            name: compiler.identifier({ text: 'url' }),
          }),
        });
        break;
      case 'date':
      case 'email':
      case 'time':
      case 'uuid':
        stringExpression = compiler.callExpression({
          functionName: compiler.propertyAccessExpression({
            expression: stringExpression,
            name: compiler.identifier({ text: schema.format }),
          }),
        });
        break;
    }
  }

  if (schema.minLength === schema.maxLength && schema.minLength !== undefined) {
    stringExpression = compiler.callExpression({
      functionName: compiler.propertyAccessExpression({
        expression: stringExpression,
        name: lengthIdentifier,
      }),
      parameters: [compiler.valueToExpression({ value: schema.minLength })],
    });
  } else {
    if (schema.minLength !== undefined) {
      stringExpression = compiler.callExpression({
        functionName: compiler.propertyAccessExpression({
          expression: stringExpression,
          name: minIdentifier,
        }),
        parameters: [compiler.valueToExpression({ value: schema.minLength })],
      });
    }

    if (schema.maxLength !== undefined) {
      stringExpression = compiler.callExpression({
        functionName: compiler.propertyAccessExpression({
          expression: stringExpression,
          name: maxIdentifier,
        }),
        parameters: [compiler.valueToExpression({ value: schema.maxLength })],
      });
    }
  }

  if (schema.pattern) {
    stringExpression = compiler.callExpression({
      functionName: compiler.propertyAccessExpression({
        expression: stringExpression,
        name: regexIdentifier,
      }),
      parameters: [compiler.regularExpressionLiteral({ text: schema.pattern })],
    });
  }

  return stringExpression;
};

const tupleTypeToZodSchema = ({
  plugin,
  schema,
  state,
}: {
  plugin: Plugin.Instance<ResolvedConfig>;
  schema: SchemaWithType<'tuple'>;
  state: State;
}) => {
  if (schema.const && Array.isArray(schema.const)) {
    const tupleElements = schema.const.map((value) =>
      compiler.callExpression({
        functionName: compiler.propertyAccessExpression({
          expression: zIdentifier,
          name: literalIdentifier,
        }),
        parameters: [compiler.valueToExpression({ value })],
      }),
    );
    const expression = compiler.callExpression({
      functionName: compiler.propertyAccessExpression({
        expression: zIdentifier,
        name: compiler.identifier({ text: 'tuple' }),
      }),
      parameters: [
        compiler.arrayLiteralExpression({
          elements: tupleElements,
        }),
      ],
    });
    return expression;
  }

  const tupleElements: Array<ts.Expression> = [];

  for (const item of schema.items ?? []) {
    tupleElements.push(
      schemaToZodSchema({
        plugin,
        schema: item,
        state,
      }),
    );
  }

  const expression = compiler.callExpression({
    functionName: compiler.propertyAccessExpression({
      expression: zIdentifier,
      name: compiler.identifier({ text: 'tuple' }),
    }),
    parameters: [
      compiler.arrayLiteralExpression({
        elements: tupleElements,
      }),
    ],
  });
  return expression;
};

const undefinedTypeToZodSchema = ({
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  schema,
}: {
  context: IR.Context;
  schema: SchemaWithType<'undefined'>;
}) => {
  const expression = compiler.callExpression({
    functionName: compiler.propertyAccessExpression({
      expression: zIdentifier,
      name: compiler.identifier({ text: 'undefined' }),
    }),
  });
  return expression;
};

const unknownTypeToZodSchema = ({
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  schema,
}: {
  context: IR.Context;
  schema: SchemaWithType<'unknown'>;
}) => {
  const expression = compiler.callExpression({
    functionName: compiler.propertyAccessExpression({
      expression: zIdentifier,
      name: compiler.identifier({ text: 'unknown' }),
    }),
  });
  return expression;
};

const voidTypeToZodSchema = ({
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  schema,
}: {
  context: IR.Context;
  schema: SchemaWithType<'void'>;
}) => {
  const expression = compiler.callExpression({
    functionName: compiler.propertyAccessExpression({
      expression: zIdentifier,
      name: compiler.identifier({ text: 'void' }),
    }),
  });
  return expression;
};

const schemaTypeToZodSchema = ({
  context,
  plugin,
  schema,
  state,
}: {
  context: IR.Context;
  plugin: Plugin.Instance<ResolvedConfig>;
  schema: IR.SchemaObject;
  state: State;
}): {
  anyType?: string;
  expression: ts.Expression;
} => {
  switch (schema.type as Required<IR.SchemaObject>['type']) {
    case 'array':
      return {
        expression: arrayTypeToZodSchema({
          context,
          plugin,
          schema: schema as SchemaWithType<'array'>,
          state,
        }),
      };
    case 'boolean':
      return {
        expression: booleanTypeToZodSchema({
          context,
          schema: schema as SchemaWithType<'boolean'>,
        }),
      };
    case 'enum':
      return {
        expression: enumTypeToZodSchema({
          context,
          schema: schema as SchemaWithType<'enum'>,
        }),
      };
    case 'integer':
    case 'number':
      return {
        expression: numberTypeToZodSchema({
          context,
          schema: schema as SchemaWithType<'integer' | 'number'>,
        }),
      };
    case 'never':
      return {
        expression: neverTypeToZodSchema({
          context,
          schema: schema as SchemaWithType<'never'>,
        }),
      };
    case 'null':
      return {
        expression: nullTypeToZodSchema({
          context,
          schema: schema as SchemaWithType<'null'>,
        }),
      };
    case 'object':
      return objectTypeToZodSchema({
        plugin,
        schema: schema as SchemaWithType<'object'>,
        state,
      });
    case 'string':
      return {
        expression: stringTypeToZodSchema({
          context,
          schema: schema as SchemaWithType<'string'>,
        }),
      };
    case 'tuple':
      return {
        expression: tupleTypeToZodSchema({
          plugin,
          schema: schema as SchemaWithType<'tuple'>,
          state,
        }),
      };
    case 'undefined':
      return {
        expression: undefinedTypeToZodSchema({
          context,
          schema: schema as SchemaWithType<'undefined'>,
        }),
      };
    case 'unknown':
      return {
        expression: unknownTypeToZodSchema({
          context,
          schema: schema as SchemaWithType<'unknown'>,
        }),
      };
    case 'void':
      return {
        expression: voidTypeToZodSchema({
          context,
          schema: schema as SchemaWithType<'void'>,
        }),
      };
  }
};

const operationToZodSchema = ({
  operation,
  plugin,
  state,
}: {
  operation: IR.OperationObject;
  plugin: Plugin.Instance<ResolvedConfig>;
  state: State;
}) => {
  const file = plugin.context.file({ id: zodId })!;

  if (plugin.config.requests.enabled) {
    const requiredProperties: Array<string> = [];
    if (operation.body?.required) {
      requiredProperties.push('body');
    }

    const headersPropertyProperties: Record<string, IR.SchemaObject> = {};
    const headersPropertyRequired: Array<string> = [];
    const pathPropertyProperties: Record<string, IR.SchemaObject> = {};
    const pathPropertyRequired: Array<string> = [];
    const queryPropertyProperties: Record<string, IR.SchemaObject> = {};
    const queryPropertyRequired: Array<string> = [];

    if (operation.parameters) {
      // TODO: add support for cookies

      if (operation.parameters.header) {
        if (hasParameterGroupObjectRequired(operation.parameters.path)) {
          requiredProperties.push('headers');
        }

        for (const key in operation.parameters.header) {
          const parameter = operation.parameters.header[key]!;
          headersPropertyProperties[parameter.name] = parameter.schema;
          if (parameter.required) {
            headersPropertyRequired.push(parameter.name);
          }
        }
      }

      if (operation.parameters.path) {
        if (hasParameterGroupObjectRequired(operation.parameters.path)) {
          requiredProperties.push('path');
        }

        for (const key in operation.parameters.path) {
          const parameter = operation.parameters.path[key]!;
          pathPropertyProperties[parameter.name] = parameter.schema;
          if (parameter.required) {
            pathPropertyRequired.push(parameter.name);
          }
        }
      }

      if (operation.parameters.query) {
        if (hasParameterGroupObjectRequired(operation.parameters.query)) {
          requiredProperties.push('query');
        }

        for (const key in operation.parameters.query) {
          const parameter = operation.parameters.query[key]!;
          queryPropertyProperties[parameter.name] = parameter.schema;
          if (parameter.required) {
            queryPropertyRequired.push(parameter.name);
          }
        }
      }
    }

    const identifierData = file.identifier({
      // TODO: refactor for better cross-plugin compatibility
      $ref: `#/zod-data/${operation.id}`,
      case: plugin.config.requests.case,
      create: true,
      nameTransformer: plugin.config.requests.name,
      namespace: 'value',
    });
    schemaToZodSchema({
      // TODO: refactor for better cross-plugin compatibility
      $ref: `#/zod-data/${operation.id}`,
      identifier: identifierData,
      plugin,
      schema: {
        properties: {
          body: operation.body
            ? operation.body.schema
            : {
                type: 'never',
              },
          headers: Object.keys(headersPropertyProperties).length
            ? {
                properties: headersPropertyProperties,
                required: headersPropertyRequired,
                type: 'object',
              }
            : {
                type: 'never',
              },
          path: Object.keys(pathPropertyProperties).length
            ? {
                properties: pathPropertyProperties,
                required: pathPropertyRequired,
                type: 'object',
              }
            : {
                type: 'never',
              },
          query: Object.keys(queryPropertyProperties).length
            ? {
                properties: queryPropertyProperties,
                required: queryPropertyRequired,
                type: 'object',
              }
            : {
                type: 'never',
              },
        },
        required: requiredProperties,
        type: 'object',
      },
      state,
    });
  }

  if (plugin.config.responses.enabled) {
    if (operation.responses) {
      const { response } = operationResponsesMap(operation);

      if (response) {
        const identifierResponse = file.identifier({
          // TODO: refactor for better cross-plugin compatibility
          $ref: `#/zod-response/${operation.id}`,
          case: plugin.config.responses.case,
          create: true,
          nameTransformer: plugin.config.responses.name,
          namespace: 'value',
        });
        schemaToZodSchema({
          // TODO: refactor for better cross-plugin compatibility
          $ref: `#/zod-response/${operation.id}`,
          identifier: identifierResponse,
          plugin,
          schema: response,
          state,
        });
      }
    }
  }
};

const schemaToZodSchema = ({
  $ref,
  identifier: _identifier,
  optional,
  plugin,
  schema,
  state,
}: {
  /**
   * When $ref is supplied, a node will be emitted to the file.
   */
  $ref?: string;
  identifier?: Identifier;
  /**
   * Accept `optional` to handle optional object properties. We can't handle
   * this inside the object function because `.optional()` must come before
   * `.default()` which is handled in this function.
   */
  optional?: boolean;
  plugin: Plugin.Instance<ResolvedConfig>;
  schema: IR.SchemaObject;
  state: State;
}): ts.Expression => {
  const file = plugin.context.file({ id: zodId })!;

  let anyType: string | undefined;
  let expression: ts.Expression | undefined;
  let identifier: ReturnType<typeof file.identifier> | undefined = _identifier;

  if ($ref) {
    state.circularReferenceTracker.add($ref);

    if (!identifier) {
      identifier = file.identifier({
        $ref,
        case: state.nameCase,
        create: true,
        nameTransformer: state.nameTransformer,
        namespace: 'value',
      });
    }
  }

  if (schema.$ref) {
    const isCircularReference = state.circularReferenceTracker.has(schema.$ref);

    // if $ref hasn't been processed yet, inline it to avoid the
    // "Block-scoped variable used before its declaration." error
    // this could be (maybe?) fixed by reshuffling the generation order
    let identifierRef = file.identifier({
      $ref: schema.$ref,
      case: state.nameCase,
      nameTransformer: state.nameTransformer,
      namespace: 'value',
    });

    if (!identifierRef.name) {
      const ref = plugin.context.resolveIrRef<IR.SchemaObject>(schema.$ref);
      expression = schemaToZodSchema({
        $ref: schema.$ref,
        plugin,
        schema: ref,
        state,
      });

      identifierRef = file.identifier({
        $ref: schema.$ref,
        case: state.nameCase,
        nameTransformer: state.nameTransformer,
        namespace: 'value',
      });
    }

    // if `identifierRef.name` is falsy, we already set expression above
    if (identifierRef.name) {
      const refIdentifier = compiler.identifier({ text: identifierRef.name });
      if (isCircularReference) {
        expression = compiler.callExpression({
          functionName: compiler.propertyAccessExpression({
            expression: zIdentifier,
            name: lazyIdentifier,
          }),
          parameters: [
            compiler.arrowFunction({
              statements: [
                compiler.returnStatement({
                  expression: refIdentifier,
                }),
              ],
            }),
          ],
        });
        state.hasCircularReference = true;
      } else {
        expression = refIdentifier;
      }
    }
  } else if (schema.type) {
    const zodSchema = schemaTypeToZodSchema({
      context: plugin.context,
      plugin,
      schema,
      state,
    });
    anyType = zodSchema.anyType;
    expression = zodSchema.expression;

    if (plugin.config.metadata && schema.description) {
      expression = compiler.callExpression({
        functionName: compiler.propertyAccessExpression({
          expression,
          name: describeIdentifier,
        }),
        parameters: [compiler.stringLiteral({ text: schema.description })],
      });
    }
  } else if (schema.items) {
    schema = deduplicateSchema({ schema });

    if (schema.items) {
      const itemTypes = schema.items.map((item) =>
        schemaToZodSchema({
          plugin,
          schema: item,
          state,
        }),
      );

      if (schema.logicalOperator === 'and') {
        const firstSchema = schema.items[0]!;
        // we want to add an intersection, but not every schema can use the same API.
        // if the first item contains another array or not an object, we cannot use
        // `.merge()` as that does not exist on `.union()` and non-object schemas.
        if (
          firstSchema.logicalOperator === 'or' ||
          (firstSchema.type && firstSchema.type !== 'object')
        ) {
          expression = compiler.callExpression({
            functionName: compiler.propertyAccessExpression({
              expression: zIdentifier,
              name: intersectionIdentifier,
            }),
            parameters: itemTypes,
          });
        } else {
          expression = itemTypes[0];
          itemTypes.slice(1).forEach((item) => {
            expression = compiler.callExpression({
              functionName: compiler.propertyAccessExpression({
                expression: expression!,
                name: andIdentifier,
              }),
              parameters: [item],
            });
          });
        }
      } else {
        expression = compiler.callExpression({
          functionName: compiler.propertyAccessExpression({
            expression: zIdentifier,
            name: unionIdentifier,
          }),
          parameters: [
            compiler.arrayLiteralExpression({
              elements: itemTypes,
            }),
          ],
        });
      }
    } else {
      expression = schemaToZodSchema({
        plugin,
        schema,
        state,
      });
    }
  } else {
    // catch-all fallback for failed schemas
    const zodSchema = schemaTypeToZodSchema({
      context: plugin.context,
      plugin,
      schema: {
        type: 'unknown',
      },
      state,
    });
    anyType = zodSchema.anyType;
    expression = zodSchema.expression;
  }

  if ($ref) {
    state.circularReferenceTracker.delete($ref);
  }

  if (expression) {
    if (schema.accessScope === 'read') {
      expression = compiler.callExpression({
        functionName: compiler.propertyAccessExpression({
          expression,
          name: readonlyIdentifier,
        }),
      });
    }

    if (optional) {
      expression = compiler.callExpression({
        functionName: compiler.propertyAccessExpression({
          expression,
          name: optionalIdentifier,
        }),
      });
    }

    if (schema.default !== undefined) {
      const isBigInt = schema.type === 'integer' && schema.format === 'int64';
      const callParameter = numberParameter({
        isBigInt,
        value: schema.default,
      });
      if (callParameter) {
        expression = compiler.callExpression({
          functionName: compiler.propertyAccessExpression({
            expression,
            name: defaultIdentifier,
          }),
          parameters: [callParameter],
        });
      }
    }
  }

  // emit nodes only if $ref points to a reusable component
  if (identifier && identifier.name && identifier.created) {
    const statement = compiler.constVariable({
      comment: plugin.config.comments
        ? createSchemaComment({ schema })
        : undefined,
      exportConst: true,
      expression: expression!,
      name: identifier.name,
      typeName: state.hasCircularReference
        ? (compiler.propertyAccessExpression({
            expression: zIdentifier,
            name: anyType || 'ZodTypeAny',
          }) as unknown as ts.TypeNode)
        : undefined,
    });
    file.add(statement);
  }

  return expression!;
};

export const handler: Plugin.Handler<ResolvedConfig> = ({ plugin }) => {
  const file = plugin.createFile({
    id: zodId,
    identifierCase: 'camelCase',
    path: plugin.output,
  });

  file.import({
    module: 'zod',
    name: 'z',
  });

  plugin.subscribe('operation', ({ operation }) => {
    const state: State = {
      circularReferenceTracker: new Set(),
      hasCircularReference: false,
      nameCase: plugin.config.definitions.case,
      nameTransformer: plugin.config.definitions.name,
    };

    operationToZodSchema({
      operation,
      plugin,
      state,
    });
  });

  plugin.subscribe('parameter', ({ $ref, parameter }) => {
    const state: State = {
      circularReferenceTracker: new Set(),
      hasCircularReference: false,
      nameCase: plugin.config.definitions.case,
      nameTransformer: plugin.config.definitions.name,
    };

    schemaToZodSchema({
      $ref,
      plugin,
      schema: parameter.schema,
      state,
    });
  });

  plugin.subscribe('requestBody', ({ $ref, requestBody }) => {
    const state: State = {
      circularReferenceTracker: new Set(),
      hasCircularReference: false,
      nameCase: plugin.config.definitions.case,
      nameTransformer: plugin.config.definitions.name,
    };

    schemaToZodSchema({
      $ref,
      plugin,
      schema: requestBody.schema,
      state,
    });
  });

  plugin.subscribe('schema', ({ $ref, schema }) => {
    const state: State = {
      circularReferenceTracker: new Set(),
      hasCircularReference: false,
      nameCase: plugin.config.definitions.case,
      nameTransformer: plugin.config.definitions.name,
    };

    schemaToZodSchema({
      $ref,
      plugin,
      schema,
      state,
    });
  });
};
