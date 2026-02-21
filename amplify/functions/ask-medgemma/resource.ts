import { defineFunction } from '@aws-amplify/backend';

export const askMedGemma = defineFunction({
  entry: './handler.ts',
  timeoutSeconds: 90,
  memoryMB: 512,
});