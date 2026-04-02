import { defineFunction } from '@aws-amplify/backend';

export const logConversationEvent = defineFunction({
    name: 'logConversationEvent',
    entry: './handler.ts',
    runtime: 20,
    timeoutSeconds: 10,
    memoryMB: 128,
});
