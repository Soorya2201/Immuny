import { defineFunction } from '@aws-amplify/backend';

export const getConversationLogs = defineFunction({
    name: 'getConversationLogs',
    entry: './handler.ts',
    runtime: 20,
    timeoutSeconds: 10,
    memoryMB: 128,
});
