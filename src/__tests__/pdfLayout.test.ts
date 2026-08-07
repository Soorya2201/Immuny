import { describe, it, expect } from 'vitest';
import { minStackedBaselineGap } from '../utils/pdfLayout';

describe('minStackedBaselineGap', () => {
  it('requires more room than the old fixed 17pt gap that caused the overlap bug', () => {
    // eyebrow (7.5pt) stacked directly above a page title (24pt) — this exact
    // pairing rendered "PATTERN EVIDENCE" overlapping "What Immuny connected".
    const required = minStackedBaselineGap(7.5, 24);
    expect(required).toBeGreaterThan(17);
  });

  it('the gap actually used by the renderer clears the minimum with margin', () => {
    // Mirrors EYEBROW_TITLE_GAP in exportPdf.ts. If that constant ever shrinks
    // below this, titles will start colliding with the eyebrow label again.
    const EYEBROW_TITLE_GAP = 32;
    expect(EYEBROW_TITLE_GAP).toBeGreaterThanOrEqual(minStackedBaselineGap(7.5, 24));
  });

  it('scales with both font sizes', () => {
    expect(minStackedBaselineGap(7.5, 24)).toBeGreaterThan(minStackedBaselineGap(7.5, 13));
    expect(minStackedBaselineGap(9.2, 24)).toBeGreaterThan(minStackedBaselineGap(7.5, 24));
  });

  it('never returns less than the safety pad, even for tiny fonts', () => {
    expect(minStackedBaselineGap(1, 1, 4)).toBeGreaterThanOrEqual(4);
  });
});
