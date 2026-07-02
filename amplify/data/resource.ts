import { type ClientSchema, a, defineData } from '@aws-amplify/backend';
import { askMedGemma } from '../functions/ask-medgemma/resource';
import { askNovaMicro } from '../functions/ask-nova-micro/resource';
import { logConversationEvent } from '../functions/log-conversation-event/resource';
import { getConversationLogs } from '../functions/get-conversation-logs/resource';
import { fetchAllergyNews } from '../functions/fetch-allergy-news/resource';

const schema = a.schema({
  // ── User profile ────────────────────────────────────────────────────────────
  UserProfile: a.model({
    name: a.string(),
    age: a.integer(),
    medicalHistory: a.string(),
    notificationPrefs: a.string(),   // JSON string for notification toggles
    caregiverRelationship: a.string(),  // e.g. 'Mother', 'Father', 'Guardian'
    contactEmail: a.string(),
    contactPhone: a.string(),
    onboardingComplete: a.boolean(),
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

  // ── Medications (schedule) ────────────────────────────────────────────────
  Medication: a.model({
    name: a.string().required(),
    dose: a.string(),
    unit: a.string(),
    route: a.string(),
    timeLabel: a.string(),       // 'Morning' | 'Afternoon' | 'Evening' | 'Night' | 'As needed'
    scheduledTime: a.string(),   // 'HH:MM' 24-hour; null for 'as needed'
    frequency: a.string(),       // free text, e.g. 'once', 'twice daily'
    active: a.boolean(),
  }).authorization(allow => [allow.owner()]),

  // ── Medication doses actually taken ──────────────────────────────────────
  MedicationLog: a.model({
    medicationId: a.string().required(),
    takenAt: a.string().required(),   // full ISO datetime
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
    allow.authenticated().to(['read', 'update']), // any auth user can like
  ]),

  // ── Community post comments ──────────────────────────────────────────────
  PostComment: a.model({
    postId: a.string().required(),
    authorUsername: a.string(),       // null when anonymous
    anonymous: a.boolean(),
    content: a.string().required(),
  }).authorization(allow => [
    allow.owner(),
    allow.authenticated().to(['read', 'create']), // any auth user can read/add comments
  ]),

  // ── Post likes — one row per (post, user) enforces one like per account ──
  PostLike: a.model({
    postId: a.string().required(),
    userId: a.string().required(),
  }).identifier(['postId', 'userId'])
    .authorization(allow => [
      allow.owner(),
      allow.authenticated().to(['read', 'create']), // any auth user can like; only the liker can unlike (owner-only delete)
    ]),

  // ── Allergy news (scraped on a schedule by fetchAllergyNews) ─────────────
  NewsArticle: a.model({
    title: a.string().required(),
    url: a.string().required(),
    source: a.string(),
    publishedAt: a.string(),
    fetchedAt: a.string(),
  }).authorization(allow => [
    allow.authenticated().to(['read']),
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
}).authorization(allow => [
  // Grants fetchAllergyNews IAM access to the Data API (used to write/prune NewsArticle rows).
  allow.resource(fetchAllergyNews),
]);

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: 'userPool',
  },
});
