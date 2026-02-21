import { type ClientSchema, a, defineData } from '@aws-amplify/backend';
import { askMedGemma } from '../functions/ask-medgemma/resource';

const schema = a.schema({
  // User profile data model
  UserProfile: a.model({
    name: a.string(),
    age: a.integer(),
    medicalHistory: a.string(),
    // Only the owner can see/edit their own profile
  }).authorization(allow => [allow.owner()]),

  // Custom AI query backed by the askMedGemma Lambda function
  askMedGemma: a.query()
    .arguments({ question: a.string() })
    .returns(a.string())
    .authorization(allow => [allow.authenticated()])
    .handler(a.handler.function(askMedGemma)),
});

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: 'userPool',
  },
});
