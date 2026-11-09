import { describe, expect, it } from 'vitest';
import {
  appendScan,
  ingredientsReviewText,
  nutritionReviewText,
  reviewTextFor,
  summaryReviewText,
  type LabelScan,
} from '../utils/labelScan';

const nova: LabelScan = {
  engine: 'nova-lite',
  readable: true,
  productName: 'Oat Crunch Granola',
  ingredients: 'Whole grain oats, sugar, almonds, honey, soy lecithin.',
  allergens: ['tree nuts (almonds)', 'soy'],
  mayContain: ['peanuts', 'milk'],
  nutrition: { servingSize: '2/3 cup (55g)', calories: '240', sodium: '95mg', protein: '6g' },
  summary: 'A sweetened oat granola with almonds.',
  rawText: '',
};

const textract: LabelScan = {
  engine: 'textract', readable: true, productName: null, ingredients: null,
  allergens: [], mayContain: [], nutrition: {}, summary: '', rawText: 'INGREDIENTS: OATS, SUGAR',
};

describe('label scan review text', () => {
  it('lists ingredients as printed with a Contains line, without may-contain warnings', () => {
    const text = ingredientsReviewText(nova);
    expect(text).toBe('Whole grain oats, sugar, almonds, honey, soy lecithin.\nContains: tree nuts (almonds), soy');
    expect(text).not.toMatch(/peanut/);
  });

  it('prints nutrients in Nutrition Facts order, skipping unreadable ones', () => {
    expect(nutritionReviewText(nova)).toBe('Serving size: 2/3 cup (55g)\nCalories: 240\nSodium: 95mg\nProtein: 6g');
  });

  it('keeps may-contain warnings in the summary', () => {
    expect(summaryReviewText(nova)).toBe(
      'Oat Crunch Granola. A sweetened oat granola with almonds. May contain: peanuts, milk.',
    );
  });

  it('uses the raw Textract text when Nova Lite was not used', () => {
    expect(reviewTextFor('ingredients', textract)).toBe('INGREDIENTS: OATS, SUGAR');
    expect(reviewTextFor('nutrition', textract)).toBe('INGREDIENTS: OATS, SUGAR');
    expect(summaryReviewText(textract)).toBe('');
  });

  it('falls back to the other panel when the photo did not match the button', () => {
    const onlyNutrition = { ...nova, ingredients: null, allergens: [] };
    expect(reviewTextFor('ingredients', onlyNutrition)).toMatch(/^Serving size/);
  });

  it('appends scans with a separator and ignores empty ones', () => {
    expect(appendScan('', 'a')).toBe('a');
    expect(appendScan('a', 'b')).toBe('a\n---\nb');
    expect(appendScan('a', '')).toBe('a');
  });
});
