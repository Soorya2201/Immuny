// Shared allergen vocabulary used by the profile's "Known Allergies" picker and
// the Health Logger's exposure tags, so a name entered in one place matches the
// name used in the other (needed for Insights to link them together).
export const COMMON_ALLERGENS = [
  'Peanut', 'Tree nuts', 'Milk', 'Egg', 'Wheat', 'Soy', 'Sesame', 'Shellfish',
  'Fish', 'Latex', 'Pollen', 'Dust', 'Mold', 'Pet dander', 'Bee/wasp sting',
];

// The FDA's "Big 9" major food allergens (sesame added by the 2023 FASTER Act).
export interface Big9Allergen {
  name: string;
  code: string;
}

export const BIG_9_ALLERGENS: Big9Allergen[] = [
  { name: 'Milk', code: 'MI' },
  { name: 'Egg', code: 'EG' },
  { name: 'Peanut', code: 'PE' },
  { name: 'Tree nuts', code: 'TR' },
  { name: 'Wheat', code: 'WH' },
  { name: 'Soy', code: 'SO' },
  { name: 'Fish', code: 'FI' },
  { name: 'Shellfish', code: 'SH' },
  { name: 'Sesame', code: 'SE' },
];

export interface Big9Status extends Big9Allergen {
  tested: boolean;
}

// An allergen counts as "tested" once a completed ExposureTest names it —
// matched loosely (substring, case-insensitive) since users type free text
// for the test's allergen field (e.g. "Peanut butter" should match "Peanut").
export function getBig9Status(testedAllergens: string[]): Big9Status[] {
  const lowerTested = testedAllergens.map(a => a.toLowerCase());
  return BIG_9_ALLERGENS.map(a => ({
    ...a,
    tested: lowerTested.some(t => t.includes(a.name.toLowerCase()) || a.name.toLowerCase().includes(t)),
  }));
}
