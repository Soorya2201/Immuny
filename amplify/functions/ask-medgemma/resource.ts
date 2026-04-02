import { defineFunction } from '@aws-amplify/backend';

export const askMedGemma = defineFunction({
  name: 'askMedGemma',
  entry: './handler.ts',
  runtime: 20,
  timeoutSeconds: 90,
  memoryMB: 512,
});