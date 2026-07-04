import { defineFunction } from '@aws-amplify/backend';

export const extractLabelText = defineFunction({
  name: 'extractLabelText',
  entry: './handler.ts',
  runtime: 20,
  timeoutSeconds: 30,
  memoryMB: 512,
});
