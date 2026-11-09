import { defineFunction } from '@aws-amplify/backend';

// Reads food label photos with Amazon Nova Lite (Bedrock); falls back to
// Textract plain text if Nova Lite fails.
export const scanFoodLabel = defineFunction({
  name: 'scanFoodLabel',
  entry: './handler.ts',
  runtime: 20,
  timeoutSeconds: 60,
  memoryMB: 512,
});
