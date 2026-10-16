# ImmunyAI

**An allergy tracker for households. Log meals, symptoms and medications by voice or photo, get answers from an AI companion that remembers the conversation, and hand your allergist a clinician-ready visit summary PDF.**

![React](https://img.shields.io/badge/React-TypeScript-3178C6?style=flat-square)
![AWS Amplify](https://img.shields.io/badge/AWS-Amplify%20Gen%202-FF9900?style=flat-square)
![Bedrock](https://img.shields.io/badge/LLM-Amazon%20Nova%20Micro-232F3E?style=flat-square)
![Tests](https://img.shields.io/badge/tests-280%20passing-brightgreen?style=flat-square)
![License](https://img.shields.io/badge/license-MIT-yellow?style=flat-square)

## Highlights

- **Serverless full stack on AWS.** Amplify Gen 2 with Cognito auth, a 12-model GraphQL data layer with owner-scoped authorization, and six Lambda functions wired through CDK (Bedrock, Textract, DynamoDB, EventBridge).
- **Voice logging that doesn't lose data.** The LLM is called once, to understand the opening sentence ("my son has hives on his arm"). Every follow-up answer ("a three", "this morning") is parsed deterministically, so severity and timing are never mangled or silently dropped.
- **Label scanning.** Photos of ingredient and nutrition labels go through Amazon Textract (up to 5 images per call). The app matches the text against a shared allergen vocabulary (the FDA "Big 9") to produce a plain-language "this food contains: peanuts, milk" summary.
- **Clinical export built to be honest.** The allergist visit summary never states more than the data supports. Unrecorded fields print as "not recorded", never 0. Associations are labelled as associations. Tolerated exposures are shown next to reactions, so a clinician can judge consistency. See the samples in [`docs/reference/`](docs/reference/).
- **Built for households.** One account manages several patients (a parent logging for a child). The AI is told whose symptoms it is discussing and uses that person's relationship and pronouns.
- **280 unit tests across 13 suites** (Vitest), covering the voice interview engine, clinical report analysis, PDF layout, allergen matching, medication schedules and chat threading.

## Features

| Area | What it does |
|---|---|
| AI companion | Multi-turn allergy and health chat on **Amazon Nova Micro** (Bedrock), with session context (allergens, recent symptoms, subject of the conversation) injected into the prompt |
| Voice logger | Browser speech-to-text (Web Speech API), then a guided follow-up interview that fills a structured `HealthEntry` (type, severity, body area, time, follow-up check-in) |
| Food and label tracking | Meals with quantities and Textract OCR of ingredient and nutrition labels |
| Medications | Per-patient schedules and a dose log |
| Exposure testing | Guided, logged exposure sessions with a safety checklist before starting |
| Insights | Symptom overview, allergen chart and calendar, plus LLM-generated insights parsed into structured cards |
| Clinician export | Allergy visit summary PDF: reaction timeline, resolution times, cofactors, epinephrine availability, emergency care |
| Community and news | Posts, comments and likes, plus an allergy-news feed scraped every 48 hours by a scheduled Lambda |
| Watch status | A simulated smartwatch vitals card (heart rate, SpO2) as a placeholder for wearable integration |

## Architecture

```
React + TypeScript (Vite)
   │  Amplify Data client (GraphQL, Cognito-authenticated)
   ▼
AWS AppSync ── DynamoDB models (owner-scoped): UserProfile, FamilyMember, HealthEntry,
   │                   Medication, MedicationLog, ExposureTest, ChatThread, ChatMessage,
   │                   CommunityPost, PostComment, PostLike, NewsArticle
   │
   ├── askNovaMicro         ─► Amazon Bedrock (amazon.nova-micro-v1)
   ├── extractLabelText     ─► Amazon Textract DetectDocumentText
   ├── logConversationEvent ─► DynamoDB (90-day TTL)
   ├── getConversationLogs  ─► DynamoDB query, newest first
   ├── fetchAllergyNews     ─► EventBridge rate(2 days), plus a best-effort run on deploy
   └── askMedGemma          ─► MedGemma 1.5 4B on a GPU tunnel (experimental, not called by the UI)
```

## Engineering decisions

- **Deterministic parsing after one LLM call** (`src/utils/voiceInterview.ts`). Short constrained answers are cheaper, faster and more reliable to parse with rules than to send back to a model.
- **Nullable strings for clinical fields.** "Answered no" and "never asked" are different facts in a medical document, so `epinephrineAvailable`, `emergencyCare` and similar fields are nullable rather than booleans.
- **Pure analysis, dumb renderer.** `clinicalReport.ts` turns raw entries into report content synchronously and testably; the PDF layer only draws.
- **Non-blocking deploy hooks.** The news pre-fetch on deploy is fire-and-forget with errors ignored, so a failed "nice to have" can't roll back the whole CloudFormation stack.
- **A real 48-hour schedule.** A CDK `rate()` rule is used because Amplify's `schedule` shorthand silently runs daily for "every N days".

## Tech stack

React 19, TypeScript, Vite, Vitest · AWS Amplify Gen 2 (AppSync, Cognito, DynamoDB, Lambda), AWS CDK · Amazon Bedrock (Nova Micro), Amazon Textract, EventBridge · Web Speech API

## Run locally

```bash
npm install
npx ampx sandbox      # deploys a personal Amplify backend (needs AWS credentials with Bedrock access)
npm run dev
npm test              # 280 tests
```

## Status

A working prototype, not a medical device. It does not diagnose, and the clinician export is a record of what the user logged. Wearable vitals are simulated. The MedGemma path is experimental and depends on a temporary GPU tunnel.

## License

MIT — see [LICENSE](LICENSE).
