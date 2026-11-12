import { describe, it, expect } from 'vitest';
import { HEADER_DISCLAIMER, footerText } from '../utils/exportPdf';

// The PDF header and footer print on every page; these are the words that
// tell a reader the visit summary is not a clinical document.
describe('visit summary disclaimers', () => {
  it('header says user-reported wellness data and not a clinical diagnostic report', () => {
    expect(HEADER_DISCLAIMER).toMatch(/USER-REPORTED WELLNESS DATA/);
    expect(HEADER_DISCLAIMER).toMatch(/NOT A CLINICAL DIAGNOSTIC REPORT/);
  });

  it('footer carries the same statement with and without the patient name', () => {
    for (const text of [footerText('Mackenzie'), footerText()]) {
      expect(text).toMatch(/User-reported wellness data/);
      expect(text).toMatch(/not a clinical diagnostic report/);
    }
    expect(footerText('Mackenzie')).toMatch(/for Mackenzie\./);
  });
});
