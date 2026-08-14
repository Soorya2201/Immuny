import { describe, it, expect, vi } from 'vitest';

// patients.ts builds an Amplify client at module scope; the pure helpers under
// test here never touch it.
vi.mock('aws-amplify/data', () => ({ generateClient: () => ({ models: {} }) }));

const {
  ageLabel,
  buildSubjectBlock,
  composeContext,
  firstNameOf,
  patientSeed,
  possessiveRef,
  subjectRef,
} = await import('../utils/patients');
const { avatarFor, AQUATIC_AVATARS } = await import('../utils/avatars');

type Patient = Parameters<typeof buildSubjectBlock>[0] & object;

const owner = {
  id: undefined,
  isOwner: true,
  name: 'Soorya Vasudevan',
  firstName: 'Soorya',
} as Patient;

const child = (overrides: Partial<Patient> = {}) => ({
  id: 'fm-1',
  isOwner: false,
  name: 'Maya',
  firstName: 'Maya',
  relationship: 'Child',
  age: 6,
  ...overrides,
} as Patient);

describe('buildSubjectBlock', () => {
  it('returns null when there is no patient', () => {
    expect(buildSubjectBlock(null)).toBeNull();
  });

  it('keeps the second person when the subject is the account owner', () => {
    const block = buildSubjectBlock(owner)!;
    expect(block).toContain('Soorya Vasudevan about their own health');
    expect(block).toContain('"You" and "your" refer to Soorya Vasudevan');
    // No third-person redirection — the speaker really is the patient.
    expect(block).not.toContain('caregiver');
  });

  it('redirects "you" away from the subject when logging for someone else', () => {
    const block = buildSubjectBlock(child({ pronouns: 'she/her' }))!;
    expect(block).toContain('You are speaking with a caregiver ABOUT Maya');
    expect(block).toContain("Maya's pronouns are she/her");
    expect(block).toContain('"You" and "your" always mean the caregiver, never Maya');
    expect(block).toContain('Refer to Maya by name or as she/her');
    expect(block).toContain('Say "her symptoms", not "your symptoms"');
  });

  it('describes the relationship and age when known', () => {
    expect(buildSubjectBlock(child({ pronouns: 'he/him' }))).toContain('(their child, age 6)');
  });

  it('uses he/him forms for he/him pronouns', () => {
    const block = buildSubjectBlock(child({ pronouns: 'he/him' }))!;
    expect(block).toContain('as he/his');
    expect(block).toContain('Say "his symptoms"');
  });

  it('falls back to they/them rather than guessing from the name', () => {
    const block = buildSubjectBlock(child({ pronouns: undefined }))!;
    expect(block).toContain("Maya's pronouns are they/them");
    expect(block).toContain('as they/their');
  });

  it('passes custom pronouns through verbatim', () => {
    const block = buildSubjectBlock(child({ pronouns: 'ze/hir' }))!;
    expect(block).toContain("Maya's pronouns are ze/hir");
  });

  it('includes recorded allergies and conditions', () => {
    const block = buildSubjectBlock(child({
      pronouns: 'she/her',
      knownAllergies: 'Peanuts, Milk',
      medicalConditions: 'Asthma',
    }))!;
    expect(block).toContain("Maya's known allergies: Peanuts, Milk.");
    expect(block).toContain('Conditions: Asthma.');
  });

  it('reports months for an infant instead of a zero age', () => {
    expect(buildSubjectBlock(child({ age: 0, ageMonths: 8 }))).toContain('8 months old');
  });
});

describe('subject and possessive references', () => {
  it('uses the second person for the owner', () => {
    expect(subjectRef(owner)).toBe('you');
    expect(possessiveRef(owner)).toBe('your');
  });

  it('uses the first name for a family member', () => {
    expect(subjectRef(child())).toBe('Maya');
    expect(possessiveRef(child())).toBe("Maya's");
  });

  it('defaults to the second person when nobody is selected', () => {
    expect(subjectRef(null)).toBe('you');
    expect(possessiveRef(undefined)).toBe('your');
  });
});

describe('composeContext', () => {
  it('drops empty blocks and separates the rest', () => {
    expect(composeContext('SUBJECT: a', null, undefined, 'summary')).toBe('SUBJECT: a\n\nsummary');
  });

  it('returns undefined when nothing survives, so the argument is omitted', () => {
    expect(composeContext(null, undefined, '')).toBeUndefined();
  });
});

describe('helpers', () => {
  it('takes the first token as a first name', () => {
    expect(firstNameOf('Soorya  Vasudevan')).toBe('Soorya');
    expect(firstNameOf('Maya')).toBe('Maya');
  });

  it('labels age in years or months, and omits it when unknown', () => {
    expect(ageLabel(child({ age: 6 }))).toBe('age 6');
    expect(ageLabel(child({ age: 0, ageMonths: 8 }))).toBe('8 months old');
    expect(ageLabel(child({ age: undefined }))).toBeUndefined();
  });

  it('seeds avatars by id, falling back to the owner name', () => {
    expect(patientSeed(child())).toBe('fm-1');
    expect(patientSeed(owner)).toBe('owner:Soorya Vasudevan');
  });
});

describe('avatarFor', () => {
  it('honours an explicitly chosen avatar', () => {
    expect(avatarFor('seahorse', 'fm-1').key).toBe('seahorse');
  });

  it('is stable for a given seed, so an unset avatar never changes', () => {
    const first = avatarFor(undefined, 'fm-1');
    expect(avatarFor(undefined, 'fm-1')).toBe(first);
    expect(avatarFor('', 'fm-1')).toBe(first);
  });

  it('ignores an avatar key that is no longer in the set', () => {
    expect(avatarFor('narwhal', 'fm-1')).toBe(avatarFor(undefined, 'fm-1'));
  });

  it('spreads different seeds across the set', () => {
    const seeds = Array.from({ length: 40 }, (_, i) => `fm-${i}`);
    const distinct = new Set(seeds.map(s => avatarFor(undefined, s).key));
    expect(distinct.size).toBeGreaterThan(1);
    expect(AQUATIC_AVATARS.length).toBe(10);
  });

  it('never uses emoji for an avatar label or key', () => {
    const emoji = /\p{Extended_Pictographic}/u;
    for (const { key, label } of AQUATIC_AVATARS) {
      expect(emoji.test(key)).toBe(false);
      expect(emoji.test(label)).toBe(false);
    }
  });
});
