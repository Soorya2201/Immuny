import { defineBackend } from '@aws-amplify/backend';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { askMedGemma } from './functions/ask-medgemma/resource';
import { askNovaMicro } from './functions/ask-nova-micro/resource';
import { logConversationEvent } from './functions/log-conversation-event/resource';
import { getConversationLogs } from './functions/get-conversation-logs/resource';
import { PolicyStatement, Effect } from 'aws-cdk-lib/aws-iam';

const backend = defineBackend({
  auth,
  data,
  askMedGemma,
  askNovaMicro,
  logConversationEvent,
  getConversationLogs,
});

// ── MedGemma: allow SageMaker invocations (existing) ───────────────────────
backend.askMedGemma.resources.lambda.addToRolePolicy(
  new PolicyStatement({
    effect: Effect.ALLOW,
    actions: ['sagemaker:InvokeEndpoint'],
    resources: ['*'],
  }),
);

// ── Nova Micro: allow Bedrock InvokeModel ────────────────────────────────────
backend.askNovaMicro.resources.lambda.addToRolePolicy(
  new PolicyStatement({
    effect: Effect.ALLOW,
    actions: ['bedrock:InvokeModel'],
    resources: ['arn:aws:bedrock:*::foundation-model/amazon.nova-micro-v1:0'],
  }),
);

// ── Logger: allow DynamoDB writes ────────────────────────────────────────────
backend.logConversationEvent.resources.lambda.addToRolePolicy(
  new PolicyStatement({
    effect: Effect.ALLOW,
    actions: ['dynamodb:PutItem'],
    resources: ['*'],
  }),
);

// ── Logs Reader: allow DynamoDB reads ────────────────────────────────────────
backend.getConversationLogs.resources.lambda.addToRolePolicy(
  new PolicyStatement({
    effect: Effect.ALLOW,
    actions: ['dynamodb:Query'],
    resources: ['*'],
  }),
);

export default backend;