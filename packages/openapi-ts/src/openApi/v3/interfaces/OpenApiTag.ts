import type { OpenApiExternalDocs } from './OpenApiExternalDocs';

/**
 * {@link} https://github.com/OAI/OpenAPI-Specification/blob/main/versions/3.1.0.md#tag-object
 */
export interface OpenApiTag {
  description?: string;
  externalDocs?: OpenApiExternalDocs;
  name: string;
}
