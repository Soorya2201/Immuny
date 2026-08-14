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

// ── Matching allergens in ingredient text ────────────────────────────────────
//
// Naive substring matching against the names above fails in both directions on
// a real label, and both directions matter: "eggplant" was reported as egg,
// while a label listing cashews, shrimp or tahini matched nothing at all. A
// missed allergen is the one that can hurt someone.
//
// So each allergen carries the words a label actually uses, matched on word
// boundaries. This is an aid for reading a label, never a replacement for it —
// no word list covers every trade name or "natural flavours".

export interface AllergenMatcher {
  /** Matches a name in COMMON_ALLERGENS. */
  name: string;
  pattern: RegExp;
}

// Plant "milks" are not dairy. Removed before the milk test rather than
// excluded from it, so "coconut milk and butter" still reports milk.
const PLANT_MILK_RE =
  /\b(coconut|almond|soya?|oat|rice|hemp|cashew|macadamia|pea|flax|walnut|hazelnut)\s+milks?\b/g;

export const FOOD_ALLERGEN_MATCHERS: AllergenMatcher[] = [
  {
    name: 'Peanut',
    pattern: /\b(pea-?nuts?|ground-?nuts?|arachis|monkey nuts?|beer nuts?)\b/,
  },
  {
    // The FDA counts coconut as a tree nut, so it belongs here despite being a drupe.
    name: 'Tree nuts',
    pattern: /\b(tree\s?nuts?|almonds?|cashews?|walnuts?|pecans?|pistachios?|hazel-?nuts?|filberts?|macadamias?|brazil nuts?|pine nuts?|pignoli|chestnuts?|praline|marzipan|nutella|coconuts?)\b/,
  },
  {
    name: 'Milk',
    pattern: /\b(milk|dairy|whey|caseinates?|casein|lactose|lactalbumin|butter|butterfat|buttermilk|cheese|cream|creme|yogh?urt|ghee|curds?|custard|quark|ricotta|paneer)\b/,
  },
  {
    // \b keeps "eggplant" out: the boundary after "egg" fails against "p".
    name: 'Egg',
    pattern: /\b(eggs?|albumins?|albumen|ovalbumin|ovomucoid|globulin|mayonnaise|meringue|lysozyme)\b/,
  },
  {
    // Bare "flour" is deliberately absent — rice and almond flour are not wheat.
    name: 'Wheat',
    pattern: /\b(wheat|gluten|semolina|spelt|durum|farina|bulg[au]r|couscous|seitan|einkorn|kamut|triticale|farro|matzo|graham)\b/,
  },
  {
    name: 'Soy',
    pattern: /\b(soya?|soybeans?|soja|tofu|edamame|miso|tempeh|tamari|natto)\b/,
  },
  {
    name: 'Sesame',
    pattern: /\b(sesame|tahini|tahina|benne|gingelly|sesamum|halvah?|za'?atar)\b/,
  },
  {
    name: 'Shellfish',
    pattern: /\b(shell-?fish|shrimps?|prawns?|crabs?|lobsters?|cray-?fish|craw-?(fish|dads?)|langoustines?|scampi|scallops?|clams?|mussels?|oysters?|squid|calamari|octopus|abalone|krill|crustaceans?|molluscs?|mollusks?)\b/,
  },
  {
    // "shellfish" cannot match here: there is no word boundary inside it.
    name: 'Fish',
    pattern: /\b(fish|anchov(y|ies)|tuna|salmon|cod|haddock|sardines?|mackerel|tilapia|halibut|trout|pollock|herring|bonito|surimi|caviar|roe|worcestershire)\b/,
  },
];

/**
 * Allergens named in a block of ingredient text.
 *
 * Only food allergens are considered: the environmental entries in
 * COMMON_ALLERGENS (pollen, dust, pet dander) do not appear on a package.
 */
export function matchAllergensInText(text: string): string[] {
  if (!text?.trim()) return [];
  const haystack = text.toLowerCase().replace(PLANT_MILK_RE, ' ');
  return FOOD_ALLERGEN_MATCHERS.filter(m => m.pattern.test(haystack)).map(m => m.name);
}
