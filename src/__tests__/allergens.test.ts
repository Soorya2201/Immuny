import { describe, it, expect } from 'vitest';
import {
  BIG_9_ALLERGENS,
  COMMON_ALLERGENS,
  FOOD_ALLERGEN_MATCHERS,
  getBig9Status,
  matchAllergensInText,
} from '../utils/allergens';

describe('matchAllergensInText', () => {
  it('finds nothing in empty or blank text', () => {
    expect(matchAllergensInText('')).toEqual([]);
    expect(matchAllergensInText('   ')).toEqual([]);
  });

  it('reads a plain contains statement', () => {
    expect(matchAllergensInText('CONTAINS: MILK, SOY.')).toEqual(['Milk', 'Soy']);
  });

  it('is case- and plural-insensitive', () => {
    expect(matchAllergensInText('peanuts')).toEqual(['Peanut']);
    expect(matchAllergensInText('PEANUT')).toEqual(['Peanut']);
    expect(matchAllergensInText('Peanut')).toEqual(['Peanut']);
  });

  // ── Misses that could hurt someone ────────────────────────────────────────
  // A label almost never writes "tree nuts" or "shellfish"; it names the food.

  it('recognises tree nuts by the nut actually listed', () => {
    for (const nut of ['almonds', 'cashews', 'walnuts', 'pecans', 'pistachios', 'hazelnuts', 'macadamias', 'brazil nuts', 'marzipan']) {
      expect(matchAllergensInText(`INGREDIENTS: SUGAR, ${nut.toUpperCase()}`)).toContain('Tree nuts');
    }
  });

  it('recognises shellfish by the species listed', () => {
    for (const item of ['shrimp', 'prawns', 'crab', 'lobster', 'crayfish', 'scallops', 'mussels', 'squid', 'calamari']) {
      expect(matchAllergensInText(`Ingredients: ${item}, salt`)).toContain('Shellfish');
    }
  });

  it('recognises hidden dairy names', () => {
    for (const item of ['whey', 'casein', 'lactose', 'butter', 'cheese', 'ghee', 'yoghurt']) {
      expect(matchAllergensInText(`Ingredients: ${item}`)).toContain('Milk');
    }
  });

  it('recognises sesame under its other names', () => {
    for (const item of ['tahini', 'benne', 'gingelly']) {
      expect(matchAllergensInText(`Ingredients: ${item}`)).toContain('Sesame');
    }
  });

  it('recognises wheat via gluten and grain names', () => {
    for (const item of ['gluten', 'semolina', 'spelt', 'durum', 'couscous', 'seitan']) {
      expect(matchAllergensInText(`Ingredients: ${item}`)).toContain('Wheat');
    }
  });

  it('recognises hidden egg and soy names', () => {
    expect(matchAllergensInText('Ingredients: albumin, lysozyme')).toContain('Egg');
    expect(matchAllergensInText('Ingredients: mayonnaise')).toContain('Egg');
    expect(matchAllergensInText('Ingredients: tofu')).toContain('Soy');
    expect(matchAllergensInText('Ingredients: edamame, miso')).toContain('Soy');
    expect(matchAllergensInText('Ingredients: soy lecithin')).toContain('Soy');
  });

  it('recognises fish under species names', () => {
    expect(matchAllergensInText('Ingredients: anchovies')).toContain('Fish');
    expect(matchAllergensInText('Ingredients: worcestershire sauce')).toContain('Fish');
  });

  // ── False alarms that erode trust ─────────────────────────────────────────

  it('does not read eggplant as egg', () => {
    expect(matchAllergensInText('INGREDIENTS: EGGPLANT, SALT')).not.toContain('Egg');
  });

  it('does not read shellfish as fish', () => {
    const found = matchAllergensInText('Contains: shellfish');
    expect(found).toContain('Shellfish');
    expect(found).not.toContain('Fish');
  });

  it('does not read a plant milk as dairy', () => {
    for (const milk of ['coconut milk', 'almond milk', 'oat milk', 'soy milk', 'rice milk']) {
      expect(matchAllergensInText(`INGREDIENTS: ${milk.toUpperCase()}, SUGAR`)).not.toContain('Milk');
    }
  });

  it('still reports dairy when a plant milk appears beside it', () => {
    const found = matchAllergensInText('INGREDIENTS: COCONUT MILK, BUTTER, SUGAR');
    expect(found).toContain('Milk');
  });

  it('does not treat a bare flour as wheat', () => {
    expect(matchAllergensInText('INGREDIENTS: RICE FLOUR')).not.toContain('Wheat');
    expect(matchAllergensInText('INGREDIENTS: WHEAT FLOUR')).toContain('Wheat');
  });

  it('does not match a word merely containing an allergen name', () => {
    expect(matchAllergensInText('cod' + 'ex alimentarius')).not.toContain('Fish');
    expect(matchAllergensInText('soybean-free facility')).toContain('Soy');
  });

  it('returns each allergen once however many times it is named', () => {
    const found = matchAllergensInText('milk, milk solids, whey, butter');
    expect(found.filter(a => a === 'Milk')).toHaveLength(1);
  });

  it('handles a realistic multi-allergen label', () => {
    const label = `INGREDIENTS: ENRICHED WHEAT FLOUR, SUGAR, PALM OIL, COCOA,
      SOY LECITHIN, WHOLE MILK POWDER, ALMONDS, NATURAL FLAVOUR.
      CONTAINS: WHEAT, SOY, MILK, TREE NUTS. MAY CONTAIN PEANUTS.`;
    const found = matchAllergensInText(label);
    expect(found).toEqual(expect.arrayContaining(['Wheat', 'Soy', 'Milk', 'Tree nuts', 'Peanut']));
  });

  it('only reports names that exist in the shared vocabulary', () => {
    // Insights links logged tags to profile allergies by exact name, so a
    // detector inventing its own spelling would silently break that join.
    for (const { name } of FOOD_ALLERGEN_MATCHERS) {
      expect(COMMON_ALLERGENS).toContain(name);
    }
  });

  it('covers every Big 9 allergen', () => {
    const covered = new Set(FOOD_ALLERGEN_MATCHERS.map(m => m.name));
    for (const { name } of BIG_9_ALLERGENS) {
      expect(covered).toContain(name);
    }
  });
});

describe('getBig9Status', () => {
  it('marks nothing tested for an empty list', () => {
    expect(getBig9Status([]).every(a => !a.tested)).toBe(true);
  });

  it('matches loosely, since the test allergen is free text', () => {
    const status = getBig9Status(['Peanut butter']);
    expect(status.find(a => a.name === 'Peanut')?.tested).toBe(true);
    expect(status.find(a => a.name === 'Milk')?.tested).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(getBig9Status(['MILK']).find(a => a.name === 'Milk')?.tested).toBe(true);
  });

  it('returns all nine in a stable order', () => {
    expect(getBig9Status([]).map(a => a.code)).toEqual(BIG_9_ALLERGENS.map(a => a.code));
  });
});
