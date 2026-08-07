// Dev-only script: renders the clinician export from fixture data so the
// layout can be inspected without a browser, login, or microphone.
// Run with: npx tsx scripts/preview-export.mts /tmp/preview.pdf
import { readFileSync, writeFileSync } from 'node:fs';
import { buildReport, type ReportEntry, type ReportInput } from '../src/utils/clinicalReport';
import { renderVisitSummary, type LogoImage } from '../src/utils/exportPdf';

let seq = 0;
const e = (o: Partial<ReportEntry> & { type: string; name: string; time: string }): ReportEntry =>
  ({ id: `e${++seq}`, ...o });

const mk = (day: number, hour: number, min = 0) => new Date(2026, 4, day, hour, min).toISOString();

const entries: ReportEntry[] = [
  e({ type: 'Exposure', name: 'Pistachio gelato', time: mk(14, 15), tags: '["Tree nuts"]', quantity: '0.5', quantityUnit: 'cups', containsSummary: 'This food contains: Tree nuts.' }),
  e({ id: 'sym1', type: 'Symptom', name: 'Hives', time: mk(14, 15, 18), severity: 6, bodyArea: 'Face', resolvedAt: mk(14, 16, 33), resolvedPrecision: 'exact', cofactors: '["Exercise"]', relatedEntryId: 'med1' }),
  e({ id: 'med1', type: 'Medication', name: 'Cetirizine', time: mk(14, 15, 25), dose: '10', unit: 'mg', reason: 'Hives', relatedEntryId: 'sym1' }),
  e({ type: 'Exposure', name: 'Restaurant pesto pasta', time: mk(20, 19), quantity: '1', quantityUnit: 'serving' }),
  e({ type: 'Symptom', name: 'Hives', time: mk(20, 19, 38), severity: 8, resolvedAt: mk(20, 21, 38), resolvedPrecision: 'confirmed-by', epinephrineAvailable: 'no', emergencyCare: 'urgent-care', cofactors: '["Exercise","Poor sleep"]' }),
  e({ type: 'Exposure', name: 'Vegan cheese spread', time: mk(28, 12), tags: '["Tree nuts"]', quantity: '2', quantityUnit: 'tbsp' }),
  e({ type: 'Symptom', name: 'Itching', time: mk(28, 12, 12), severity: 4, bodyArea: 'Mouth' }),
  e({ type: 'Symptom', name: 'Throat tightness', time: mk(29, 23, 10), severity: 6, epinephrineAvailable: 'yes', emergencyCare: 'none' }),
  e({ type: 'Exposure', name: 'Peanut butter toast', time: mk(5, 8), tags: '["Peanut"]' }),
  e({ type: 'Exposure', name: 'Glass of milk', time: mk(6, 8), tags: '["Milk"]' }),
  e({ type: 'Exposure', name: 'Peanut snack bar', time: mk(9, 15), tags: '["Peanut"]' }),
  e({ type: 'Exposure', name: 'Scrambled eggs', time: mk(11, 8), tags: '["Egg"]' }),
  e({ type: 'Exposure', name: 'Sesame bagel', time: mk(12, 8), tags: '["Sesame"]' }),
];

const input: ReportInput = {
  patient: {
    name: 'Amelia Rivera',
    dateOfBirth: '2018-04-18',
    knownAllergies: 'Milk, Peanut',
    medicalConditions: 'Eczema, Exercise-induced asthma',
    medicalHistory: 'Father has a peanut allergy; mother has seasonal rhinitis.',
  },
  entries,
  medications: [{ id: 'm1', name: 'Cetirizine', dose: '10', unit: 'mg', route: 'Oral', active: true }],
  medicationLogs: [{ medicationId: 'm1', takenAt: mk(15, 9) }, { medicationId: 'm1', takenAt: mk(16, 9) }],
  exposureTests: [
    { testName: 'Baked milk ladder', allergen: 'Milk', testDate: mk(22, 10), status: 'completed', results: 'Tolerated 1/4 portion', reactions: 'No reaction observed over 2 hours' },
  ],
  periodStart: new Date(2026, 4, 1),
  periodEnd: new Date(2026, 6, 31, 23, 59),
  generatedAt: new Date(2026, 7, 4, 10, 0),
};

// Node has no canvas/DOM, so loadLogo()'s trim can't run here. logo_header_trimmed_preview.png
// is a one-time PIL crop of the same near-white/alpha bounding box loadLogo()
// computes in-browser, so this preview matches what users will actually see.
const logoBytes = readFileSync(new URL('./logo_header_trimmed_preview.png', import.meta.url));
const logo: LogoImage = {
  dataUrl: `data:image/png;base64,${logoBytes.toString('base64')}`,
  width: 1046,
  height: 1338,
};

const model = buildReport(input);
const pdf = renderVisitSummary(model, logo);
const outPath = process.argv[2] ?? 'preview.pdf';
writeFileSync(outPath, Buffer.from(pdf.output('arraybuffer')));
console.log('wrote', outPath);
console.log('pages:', pdf.getNumberOfPages());
console.log('pattern:', model.pattern.title, '|', model.pattern.strength);
console.log('timeline rows:', model.timeline.length, 'tolerated:', model.tolerated.length);
