// The people an account tracks: the profile owner plus every family member.
//
// An account is a household, not a person. The caregiver logging their child's
// reaction is a different human from the one the reaction happened to, and
// everything downstream — Bea's phrasing, which entries a clinician export
// contains, which chat thread you're resuming — depends on keeping them apart.

import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';

const client = generateClient<Schema>();

export interface Patient {
  /** undefined = the profile owner. Matches HealthEntry.familyMemberId, where null means the same thing. */
  id: string | undefined;
  isOwner: boolean;
  name: string;
  firstName: string;
  relationship?: string;
  pronouns?: string;
  avatarKey?: string;
  age?: number;
  ageMonths?: number;
  dateOfBirth?: string;
  knownAllergies?: string;
  medicalConditions?: string;
  medications?: string;
  /** Household-level family history from the owner's profile — applies to everyone. */
  medicalHistory?: string;
}

const clean = (v: string | null | undefined): string | undefined => {
  const t = v?.trim();
  return t ? t : undefined;
};

/** Stable identity for avatar hashing — family members have ids, the owner does not. */
export function patientSeed(p: Pick<Patient, 'id' | 'name'>): string {
  return p.id ?? `owner:${p.name}`;
}

/**
 * Load every trackable person, owner first.
 *
 * The owner comes back with `id: undefined` so the result can be compared
 * directly against `HealthEntry.familyMemberId ?? undefined`.
 */
export async function loadPatients(): Promise<Patient[]> {
  // Settled, not all: the two queries are independent, and losing the family
  // list should not also cost us the owner. An empty result here would blank
  // the switcher and strip every chat thread of the person it belongs to, so
  // this function always returns at least one patient.
  const [profileResult, familyResult] = await Promise.allSettled([
    client.models.UserProfile.list(),
    client.models.FamilyMember.list(),
  ]);

  if (profileResult.status === 'rejected') {
    console.warn('Could not load the profile — falling back to a generic owner', profileResult.reason);
  }
  if (familyResult.status === 'rejected') {
    console.warn('Could not load family members — only the owner is selectable', familyResult.reason);
  }

  const profiles = profileResult.status === 'fulfilled' ? profileResult.value.data : undefined;
  const familyMembers = familyResult.status === 'fulfilled' ? familyResult.value.data : undefined;

  const profile = profiles?.[0];
  const householdHistory = clean(profile?.medicalHistory);
  const ownerName = clean(profile?.name) ?? 'Me';

  const owner: Patient = {
    id: undefined,
    isOwner: true,
    name: ownerName,
    firstName: firstNameOf(ownerName),
    pronouns: clean(profile?.pronouns),
    avatarKey: clean(profile?.avatarKey),
    age: profile?.age ?? undefined,
    dateOfBirth: clean(profile?.dateOfBirth),
    medicalHistory: householdHistory,
  };

  const members: Patient[] = (familyMembers ?? []).map(fm => ({
    id: fm.id,
    isOwner: false,
    name: fm.name,
    firstName: firstNameOf(fm.name),
    relationship: clean(fm.relationship),
    pronouns: clean(fm.pronouns),
    avatarKey: clean(fm.avatarKey),
    age: fm.age ?? undefined,
    ageMonths: fm.ageMonths ?? undefined,
    dateOfBirth: clean(fm.dateOfBirth),
    knownAllergies: clean(fm.knownAllergies),
    medicalConditions: clean(fm.medicalConditions),
    medications: clean(fm.medications),
    medicalHistory: householdHistory,
  }));

  return [owner, ...members];
}

export function firstNameOf(name: string): string {
  return name.trim().split(/\s+/)[0] || name.trim();
}

/** "age 6" / "8 months old" / undefined when we were never told. */
export function ageLabel(p: Patient): string | undefined {
  if (p.ageMonths) return `${p.ageMonths} months old`;
  if (p.age) return `age ${p.age}`;
  return undefined;
}

/**
 * Possessive and subject forms for a set of pronouns.
 *
 * Unset pronouns resolve to they/them rather than a guess from the person's
 * name — a wrong guess misgenders someone in a document their clinician reads.
 */
function pronounForms(pronouns: string | undefined): { subject: string; possessive: string; display: string } {
  const raw = (pronouns ?? '').trim();
  const p = raw.toLowerCase();
  if (p.startsWith('she')) return { subject: 'she', possessive: 'her', display: 'she/her' };
  if (p.startsWith('he')) return { subject: 'he', possessive: 'his', display: 'he/him' };
  // Anything else (including neopronouns) is passed through verbatim so the
  // model uses what the caregiver actually wrote; only the derived subject and
  // possessive forms, which we cannot infer, fall back to they/them.
  return { subject: 'they', possessive: 'their', display: raw || 'they/them' };
}

/** "Maya's" / "your" — how to refer to this person's body, medication, symptoms. */
export function possessiveRef(p: Patient | null | undefined): string {
  if (!p || p.isOwner) return 'your';
  return `${p.firstName}'s`;
}

/** "Maya" / "you" — how to refer to the person as the subject of a question. */
export function subjectRef(p: Patient | null | undefined): string {
  if (!p || p.isOwner) return 'you';
  return p.firstName;
}

/**
 * The SUBJECT block injected into Nova's `context` argument.
 *
 * This is what stops Bea replying "your throat is swelling" to a parent
 * describing their child. The model defaults hard to second person, so the
 * instruction has to be explicit about which of the two people in the room
 * "you" refers to.
 */
export function buildSubjectBlock(p: Patient | null | undefined): string | null {
  if (!p) return null;

  if (p.isOwner) {
    return [
      `SUBJECT OF THIS CONVERSATION: You are speaking with ${p.name} about their own health.`,
      `- "You" and "your" refer to ${p.name}, the person you are talking to.`,
    ].join('\n');
  }

  const { subject, possessive, display } = pronounForms(p.pronouns);
  const descriptor = [p.relationship?.toLowerCase(), ageLabel(p)].filter(Boolean).join(', ');

  const lines = [
    `SUBJECT OF THIS CONVERSATION: You are speaking with a caregiver ABOUT ${p.name}` +
      (descriptor ? ` (their ${descriptor}).` : '.'),
    `${p.name}'s pronouns are ${display}.`,
    `- ${p.name} is NOT the person you are talking to. Never address ${p.name} directly.`,
    `- "You" and "your" always mean the caregiver, never ${p.name}.`,
    `- Refer to ${p.name} by name or as ${subject}/${possessive}. Ask "did ${p.name} take anything for it?", never "did you take anything for it?".`,
    `- Say "${possessive} symptoms", not "your symptoms".`,
  ];

  const facts: string[] = [];
  if (p.knownAllergies) facts.push(`${p.name}'s known allergies: ${p.knownAllergies}.`);
  if (p.medicalConditions) facts.push(`Conditions: ${p.medicalConditions}.`);
  if (p.medications) facts.push(`Usual medications: ${p.medications}.`);
  if (facts.length) lines.push(facts.join(' '));

  return lines.join('\n');
}

/** Joins the subject block with the rolling session summary for the `context` argument. */
export function composeContext(...blocks: (string | null | undefined)[]): string | undefined {
  const joined = blocks.filter(Boolean).join('\n\n');
  return joined || undefined;
}
