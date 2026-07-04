import { defineBackend } from '@aws-amplify/backend';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { askMedGemma } from './functions/ask-medgemma/resource';
import { askNovaMicro } from './functions/ask-nova-micro/resource';
import { logConversationEvent } from './functions/log-conversation-event/resource';
import { getConversationLogs } from './functions/get-conversation-logs/resource';
import { fetchAllergyNews } from './functions/fetch-allergy-news/resource';
import { extractLabelText } from './functions/extract-label-text/resource';
import { PolicyStatement, Effect } from 'aws-cdk-lib/aws-iam';
import { Duration } from 'aws-cdk-lib';
import { Rule, Schedule } from 'aws-cdk-lib/aws-events';
import { LambdaFunction } from 'aws-cdk-lib/aws-events-targets';
import { AwsCustomResource, AwsCustomResourcePolicy, PhysicalResourceId } from 'aws-cdk-lib/custom-resources';

const backend = defineBackend({
  auth,
  data,
  askMedGemma,
  askNovaMicro,
  logConversationEvent,
  getConversationLogs,
  fetchAllergyNews,
  extractLabelText,
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

// ── OCR: allow Textract document text detection ──────────────────────────────
backend.extractLabelText.resources.lambda.addToRolePolicy(
  new PolicyStatement({
    effect: Effect.ALLOW,
    actions: ['textract:DetectDocumentText'],
    resources: ['*'],
  }),
);

// ── Allergy news scraper: run every 2 days ────────────────────────────────
// Not using defineFunction's `schedule` shorthand — its "every N day" form
// silently ignores N for day-granularity schedules (always runs daily).
// A CDK rate() rule is the reliable way to get a true 48-hour cadence.
const newsScraperFn = backend.fetchAllergyNews.resources.lambda;
const newsScraperStack = backend.fetchAllergyNews.stack;
new Rule(newsScraperStack, 'FetchAllergyNewsSchedule', {
  schedule: Schedule.rate(Duration.days(2)),
  targets: [new LambdaFunction(newsScraperFn)],
});

// A rate() schedule only fires for the first time a full interval after
// deploy — without this, the News tab would sit empty for 2 days after every
// fresh deploy. Kick off one run immediately at deploy time; the rule above
// takes over from there.
new AwsCustomResource(newsScraperStack, 'InvokeFetchAllergyNewsOnDeploy', {
  onCreate: {
    service: 'Lambda',
    action: 'invoke',
    parameters: {
      FunctionName: newsScraperFn.functionName,
      InvocationType: 'Event', // fire-and-forget so this doesn't block deployment
    },
    physicalResourceId: PhysicalResourceId.of('InvokeFetchAllergyNewsOnDeploy'),
  },
  policy: AwsCustomResourcePolicy.fromSdkCalls({ resources: [newsScraperFn.functionArn] }),
});

export default backend;