import { defineBackend } from '@aws-amplify/backend';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { askNovaMicro } from './functions/ask-nova-micro/resource';
import { logConversationEvent } from './functions/log-conversation-event/resource';
import { getConversationLogs } from './functions/get-conversation-logs/resource';
import { fetchAllergyNews } from './functions/fetch-allergy-news/resource';
import { extractLabelText } from './functions/extract-label-text/resource';
import { PolicyStatement, Effect } from 'aws-cdk-lib/aws-iam';
import { CfnOutput, Duration, RemovalPolicy } from 'aws-cdk-lib';
import { AttributeType, BillingMode, Table } from 'aws-cdk-lib/aws-dynamodb';
import { Rule, Schedule } from 'aws-cdk-lib/aws-events';
import { LambdaFunction } from 'aws-cdk-lib/aws-events-targets';
import { AwsCustomResource, AwsCustomResourcePolicy, PhysicalResourceId } from 'aws-cdk-lib/custom-resources';

const backend = defineBackend({
  auth,
  data,
  askNovaMicro,
  logConversationEvent,
  getConversationLogs,
  fetchAllergyNews,
  extractLabelText,
});

// ── Nova Micro: allow Bedrock InvokeModel ────────────────────────────────────
backend.askNovaMicro.resources.lambda.addToRolePolicy(
  new PolicyStatement({
    effect: Effect.ALLOW,
    actions: ['bedrock:InvokeModel'],
    resources: ['arn:aws:bedrock:*::foundation-model/amazon.nova-micro-v1:0'],
  }),
);

// ── AI usage & cost table (backend only) ──────────────────────────────────────
// One row per Nova Micro call: tokens, the prices charged and the cost in USD.
// It is deliberately not an Amplify data model, so it has no GraphQL API and
// the app cannot read or write it; only the Nova function can write, and it is
// read with PartiQL from the console or scripts/ai-usage.mjs.
// Lives in the function's own stack to avoid a cross-stack reference.
const novaStack = backend.askNovaMicro.stack;
const aiUsageTable = new Table(novaStack, 'AiUsage', {
  partitionKey: { name: 'userId', type: AttributeType.STRING },
  sortKey: { name: 'sk', type: AttributeType.STRING }, // <ISO time>#<uuid>
  billingMode: BillingMode.PAY_PER_REQUEST,
  pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
  // Cost records outlive a deleted sandbox or stack.
  removalPolicy: RemovalPolicy.RETAIN,
});
// All users' calls for a day, in time order, without a full scan.
aiUsageTable.addGlobalSecondaryIndex({
  indexName: 'byDay',
  partitionKey: { name: 'day', type: AttributeType.STRING },
  sortKey: { name: 'createdAt', type: AttributeType.STRING },
});
aiUsageTable.grantWriteData(backend.askNovaMicro.resources.lambda);
backend.askNovaMicro.addEnvironment('AI_USAGE_TABLE', aiUsageTable.tableName);
new CfnOutput(novaStack, 'AiUsageTableName', { value: aiUsageTable.tableName });
backend.addOutput({ custom: { aiUsageTable: aiUsageTable.tableName } });

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
//
// This has to be best-effort: an AwsCustomResource's onCreate call runs
// synchronously during the CloudFormation deployment, so if the invoke fails
// for any reason (an IAM edge case, throttling, a cold-start timeout) the
// *entire app stack* rolls back with it — a "nice to have" pre-fetch taking
// down every other deploy. ignoreErrorCodesMatching makes a failed kick-off a
// no-op instead: the News tab just waits for the Rule above, same as before
// this optimization existed.
new AwsCustomResource(newsScraperStack, 'InvokeFetchAllergyNewsOnDeploy', {
  onCreate: {
    service: 'Lambda',
    action: 'invoke',
    parameters: {
      FunctionName: newsScraperFn.functionName,
      InvocationType: 'Event', // fire-and-forget so this doesn't block deployment
    },
    physicalResourceId: PhysicalResourceId.of('InvokeFetchAllergyNewsOnDeploy'),
    ignoreErrorCodesMatching: '.*',
  },
  policy: AwsCustomResourcePolicy.fromStatements([
    new PolicyStatement({
      effect: Effect.ALLOW,
      actions: ['lambda:InvokeFunction'],
      resources: [newsScraperFn.functionArn],
    }),
  ]),
});

export default backend;