import { defineAuth } from '@aws-amplify/backend';

/**
 * Define and configure your auth resource
 * @see https://docs.amplify.aws/gen2/build-a-backend/auth
 */
export const auth = defineAuth({
  loginWith: {
    email: true,
  },
  // Proof of consent: when the person ticked the Terms and Privacy boxes at
  // sign-up, and which versions of the documents they saw. Set once by the
  // sign-up form (src/components/authConfig.ts). Custom attributes cannot be
  // removed from a user pool after they are added.
  userAttributes: {
    'custom:legal_accepted_at': { dataType: 'String', mutable: true },
    'custom:legal_version': { dataType: 'String', mutable: true },
  },
});
