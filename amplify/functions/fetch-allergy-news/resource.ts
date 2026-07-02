import { defineFunction } from '@aws-amplify/backend';

// No `schedule` here — Amplify's "every N day" shorthand silently ignores the
// interval count for day-granularity schedules (always runs daily regardless
// of N). The real every-2-days cadence is wired manually in backend.ts via a
// CDK EventBridge rate() rule instead.
export const fetchAllergyNews = defineFunction({
  name: 'fetchAllergyNews',
  entry: './handler.ts',
  runtime: 20,
  timeoutSeconds: 60,
  memoryMB: 512,
});
