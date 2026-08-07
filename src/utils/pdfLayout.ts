// ─── PDF stacked-text geometry ─────────────────────────────────────────────────
// Pure math, deliberately kept separate from exportPdf.ts so the rule that
// caused the title-overlap bug can be unit tested without rendering a PDF.
//
// jsPDF positions text by its BASELINE, not its visual top. Two lines stacked
// at the same x with only a "looks about right" gap between baselines will
// silently collide the moment the lower line uses a bigger font than the
// gap accounts for — which is exactly what happened: the eyebrow label's
// baseline sat only 17pt above the 24pt title's baseline, but a 24pt bold
// title needs about 21.7pt of clear space above ITS OWN baseline just for
// its ascenders. Any call site that hand-picks a gap can reintroduce this.
export const HELVETICA_BOLD_ASCENT_RATIO = 0.905;   // Adobe AFM: Helvetica-Bold Ascender / 1000
export const HELVETICA_BOLD_DESCENT_RATIO = 0.212;  // Adobe AFM: Helvetica-Bold Descender / 1000

/**
 * Minimum safe baseline-to-baseline gap between two stacked lines of
 * Helvetica-Bold text, so the lower line's ascent can never reach into the
 * upper line's descent — regardless of what either line says.
 */
export function minStackedBaselineGap(aboveSize: number, belowSize: number, safetyPad = 2): number {
  return aboveSize * HELVETICA_BOLD_DESCENT_RATIO + belowSize * HELVETICA_BOLD_ASCENT_RATIO + safetyPad;
}
