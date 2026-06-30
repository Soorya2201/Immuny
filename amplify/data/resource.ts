import { type ClientSchema, a, defineData } from '@aws-amplify/backend';
import { askMedGemma } from '../functions/ask-medgemma/resource';
import { askNovaMicro } from '../functions/ask-nova-micro/resource';
import { logConversationEvent } from '../functions/log-conversation-event/resource';
import { getConversationLogs } from '../functions/get-conversation-logs/resource';

const schema = a.schema({
  // ── User profile ────────────────────────────────────────────────────────────
  UserProfile: a.model({
    name: a.string(),
    age: a.integer(),
    medicalHistory: a.string(),
    notificationPrefs: a.string(),   // JSON string for notification toggles
  }).authorization(allow => [allow.owner()]),

  // ── Health entries (Symptom Logger) ────────────────────────────────────────
  HealthEntry: a.model({
    type: a.string().required(),       // 'Exposure' | 'Symptom' | 'Medication'
    subtype: a.string(),               // e.g. 'Meal', 'Product'
    name: a.string().required(),
    severity: a.integer(),
    bodyArea: a.string(),
    notes: a.string(),
    tags: a.string(),                  // JSON string array
    details: a.string(),
    dose: a.string(),
    unit: a.string(),
    route: a.string(),
    reason: a.string(),
    time: a.string().required(),
  }).authorization(allow => [allow.owner()]),

  // ── Exposure tests ────────────────────────────────────────────────────────
  ExposureTest: a.model({
    testName: a.string().required(),
    allergen: a.string().required(),
    amount: a.float(),
    unit: a.string(),
    servingContext: a.string(),
    protocol: a.string(),
    baselineSymptoms: a.string(),
    testDate: a.string().required(),
    testTime: a.string(),
    monitoringDuration: a.string(),
    reminders: a.string(),            // JSON string array
    status: a.string().required(),    // 'planned' | 'active' | 'completed'
    results: a.string(),
    reactions: a.string(),
  }).authorization(allow => [allow.owner()]),

  // ── Family members ────────────────────────────────────────────────────────
  FamilyMember: a.model({
    name: a.string().required(),
    relationship: a.string().required(),  // e.g. 'Spouse', 'Child', 'Parent', 'Sibling'
    age: a.integer(),
    knownAllergies: a.string(),           // comma-separated or free text
    medicalConditions: a.string(),
    medications: a.string(),
    notes: a.string(),
  }).authorization(allow => [allow.owner()]),

  // ── Community posts ──────────────────────────────────────────────────────
  CommunityPost: a.model({
    authorUsername: a.string(),       // null when anonymous
    anonymous: a.boolean(),
    title: a.string().required(),
    content: a.string().required(),
    likes: a.integer(),
  }).authorization(allow => [
    allow.owner(),
    allow.authenticated().to(['read', 'list', 'update']), // any auth user can like
  ]),

  // ── MedGemma (detailed medical — Colab/Ngrok) ────────────────────────────
  askMedGemma: a.query()
    .arguments({ question: a.string() })
    .returns(a.string())
    .authorization((allow) => [allow.authenticated()])
    .handler(a.handler.function(askMedGemma)),

  // ── Nova Micro (fast casual — AWS Bedrock) ───────────────────────────────
  // history: JSON string of last N turns [{ role, content }]
  // context: compact session summary (allergies, current topic, symptoms)
  askNovaMicro: a.query()
    .arguments({ question: a.string(), history: a.string(), context: a.string() })
    .returns(a.string())
    .authorization((allow) => [allow.authenticated()])
    .handler(a.handler.function(askNovaMicro)),

  // ── Conversation event logger (DynamoDB) ─────────────────────────────────
  logConversationEvent: a.query()
    .arguments({ userId: a.string(), event: a.string() })
    .returns(a.boolean())
    .authorization((allow) => [allow.authenticated()])
    .handler(a.handler.function(logConversationEvent)),

  // ── Conversation logs reader (DynamoDB) ──────────────────────────────────
  getConversationLogs: a.query()
    .arguments({ userId: a.string() })
    .returns(a.string())
    .authorization((allow) => [allow.authenticated()])
    .handler(a.handler.function(getConversationLogs)),
});

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: 'userPool',
  },
});
