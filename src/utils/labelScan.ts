// Turns a Nova Lite label scan (scanFoodLabel) into the text the user checks
// in the review boxes before saving. Pure functions, so they are unit tested.

export type NutrientKey =
  | 'servingSize' | 'servingsPerContainer' | 'calories' | 'totalFat' | 'saturatedFat' | 'transFat'
  | 'cholesterol' | 'sodium' | 'totalCarbohydrate' | 'dietaryFiber' | 'totalSugars' | 'addedSugars' | 'protein';

export interface LabelScan {
  engine: 'nova-lite' | 'textract';
  readable: boolean;
  productName: string | null;
  ingredients: string | null;
  allergens: string[];
  mayContain: string[];
  nutrition: Partial<Record<NutrientKey, string>>;
  summary: string;
  rawText: string;
}

export type ScanKind = 'ingredients' | 'nutrition';

// Label order and wording follow the US Nutrition Facts panel.
const NUTRIENT_LABELS: [NutrientKey, string][] = [
  ['servingSize', 'Serving size'],
  ['servingsPerContainer', 'Servings per container'],
  ['calories', 'Calories'],
  ['totalFat', 'Total fat'],
  ['saturatedFat', 'Saturated fat'],
  ['transFat', 'Trans fat'],
  ['cholesterol', 'Cholesterol'],
  ['sodium', 'Sodium'],
  ['totalCarbohydrate', 'Total carbohydrate'],
  ['dietaryFiber', 'Dietary fiber'],
  ['totalSugars', 'Total sugars'],
  ['addedSugars', 'Added sugars'],
  ['protein', 'Protein'],
];

const joinList = (items: string[]) => items.join(', ');

/** Ingredients box: the ingredients as printed plus a "Contains:" line. */
export function ingredientsReviewText(scan: LabelScan): string {
  if (scan.engine === 'textract') return scan.rawText;
  const lines: string[] = [];
  if (scan.ingredients) lines.push(scan.ingredients);
  if (scan.allergens.length) lines.push(`Contains: ${joinList(scan.allergens)}`);
  return lines.join('\n');
}

/** Nutrition box: one "Label: value" line per nutrient that was readable. */
export function nutritionReviewText(scan: LabelScan): string {
  if (scan.engine === 'textract') return scan.rawText;
  return NUTRIENT_LABELS
    .filter(([k]) => scan.nutrition[k])
    .map(([k, label]) => `${label}: ${scan.nutrition[k]}`)
    .join('\n');
}

/**
 * Summary box: the AI summary, plus "may contain" warnings spelled out so
 * they are never lost even if the summary skips them. Kept separate from the
 * ingredients so a "may contain" warning is not counted as an ingredient.
 */
export function summaryReviewText(scan: LabelScan): string {
  if (scan.engine === 'textract') return '';
  const parts: string[] = [];
  if (scan.productName) parts.push(`${scan.productName}.`);
  if (scan.summary) parts.push(scan.summary);
  if (scan.mayContain.length) parts.push(`May contain: ${joinList(scan.mayContain)}.`);
  return parts.join(' ').trim();
}

export function reviewTextFor(kind: ScanKind, scan: LabelScan): string {
  // Whichever button was used, keep what the photo actually showed: a
  // nutrition button pointed at an ingredients panel still yields text.
  const primary = kind === 'ingredients' ? ingredientsReviewText(scan) : nutritionReviewText(scan);
  if (primary) return primary;
  return kind === 'ingredients' ? nutritionReviewText(scan) : ingredientsReviewText(scan);
}

/** Adds a new scan's text to what is already in a review box. */
export const appendScan = (prev: string, next: string) => (!next ? prev : prev ? `${prev}\n---\n${next}` : next);
