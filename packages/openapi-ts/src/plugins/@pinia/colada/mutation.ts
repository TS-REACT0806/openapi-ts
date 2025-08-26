import type ts from 'typescript';

import type { GeneratedFile } from '../../../generate/file';
import type { IR } from '../../../ir/types';
import { tsc } from '../../../tsc';
import {
  createOperationComment,
  isOperationOptionsRequired,
} from '../../shared/utils/operation';
import { handleMeta } from './meta';
import type { PluginState } from './state';
import type { PiniaColadaPlugin } from './types';
import { useTypeData } from './utils';

export const createMutationOptions = ({
  file,
  operation,
  plugin,
  queryFn,
  state,
}: {
  file: GeneratedFile;
  operation: IR.OperationObject;
  plugin: PiniaColadaPlugin['Instance'];
  queryFn: string;
  state: PluginState;
}): void => {
  if (
    !plugin.config.mutationOptions.enabled ||
    !plugin.hooks.operation.isMutation(operation)
  ) {
    return;
  }

  if (!state.hasMutations) {
    state.hasMutations = true;
  }

  state.hasUsedQueryFn = true;

  const typeData = useTypeData({ file, operation, plugin });

  const identifierMutationOptions = file.identifier({
    $ref: `#/pinia-colada-mutation-options/${operation.id}`,
    case: plugin.config.mutationOptions.case,
    create: true,
    nameTransformer: plugin.config.mutationOptions.name,
    namespace: 'value',
  });

  const awaitSdkExpression = tsc.awaitExpression({
    expression: tsc.callExpression({
      functionName: queryFn,
      parameters: ['options'],
    }),
  });

  const statements: Array<ts.Statement> = [];

  if (plugin.getPlugin('@hey-api/sdk')?.config.responseStyle === 'data') {
    statements.push(
      tsc.returnVariable({
        expression: awaitSdkExpression,
      }),
    );
  } else {
    statements.push(
      tsc.constVariable({
        destructure: true,
        expression: awaitSdkExpression,
        name: 'data',
      }),
      tsc.returnVariable({
        expression: 'data',
      }),
    );
  }

  const mutationOptionsObj: Array<{ key: string; value: ts.Expression }> = [
    {
      key: 'mutation',
      value: tsc.arrowFunction({
        async: true,
        multiLine: true,
        parameters: [
          {
            name: 'options',
            type: typeData,
          },
        ],
        statements,
      }),
    },
  ];

  const meta = handleMeta(plugin, operation, 'mutationOptions');

  if (meta) {
    mutationOptionsObj.push({
      key: 'meta',
      value: meta,
    });
  }

  const isRequiredOptionsForMutation = isOperationOptionsRequired({
    context: plugin.context,
    operation,
  });

  const statement = tsc.constVariable({
    comment: plugin.config.comments
      ? createOperationComment({ operation })
      : undefined,
    exportConst: true,
    expression: tsc.arrowFunction({
      parameters: [
        {
          isRequired: isRequiredOptionsForMutation,
          name: 'options',
          type: typeData,
        },
      ],
      statements: [
        tsc.returnStatement({
          expression: tsc.objectExpression({
            obj: mutationOptionsObj,
          }),
        }),
      ],
    }),
    name: identifierMutationOptions.name || '',
  });

  file.add(statement);
};
