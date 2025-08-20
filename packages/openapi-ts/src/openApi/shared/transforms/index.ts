import type { IR } from '../../../ir/types';
import { enumsTransform } from './enums';
import { readWriteTransform } from './readWrite';

export const transformOpenApiSpec = ({ context }: { context: IR.Context }) => {
  const { logger } = context;
  const eventTransformOpenApiSpec = logger.timeEvent('transform-openapi-spec');
  if (context.config.parser.transforms.enums.enabled) {
    enumsTransform({
      config: context.config.parser.transforms.enums,
      spec: context.spec,
    });
  }

  if (context.config.parser.transforms.readWrite.enabled) {
    readWriteTransform({
      config: context.config.parser.transforms.readWrite,
      logger,
      spec: context.spec,
    });
  }
  eventTransformOpenApiSpec.timeEnd();
};
