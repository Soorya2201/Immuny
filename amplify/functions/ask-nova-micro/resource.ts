import { defineFunction } from '@aws-amplify/backend';

export const askNovaMicro = defineFunction({
    name: 'askNovaMicro',
    entry: './handler.ts',
    runtime: 20,
    timeoutSeconds: 30,
    memoryMB: 256,
});
