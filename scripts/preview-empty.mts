// Dev-only: verifies the renderer never crashes on a brand-new patient with
// zero entries — the most common state for the button on first use.
import { readFileSync, writeFileSync } from 'node:fs';
import { buildReport, type ReportInput } from '../src/utils/clinicalReport';
import { renderVisitSummary, type LogoImage } from '../src/utils/exportPdf';

const logoBytes = readFileSync(new URL('./logo_header_trimmed_preview.png', import.meta.url));
const logo: LogoImage = { dataUrl: `data:image/png;base64,${logoBytes.toString('base64')}`, width: 1046, height: 1338 };

const input: ReportInput = {
  patient: { name: 'New Patient', dateOfBirth: null },
  entries: [],
  medications: [],
  medicationLogs: [],
  exposureTests: [],
  periodStart: new Date(2026, 4, 1),
  periodEnd: new Date(2026, 6, 31, 23, 59),
  generatedAt: new Date(2026, 7, 4, 10, 0),
};

const model = buildReport(input);
const pdf = renderVisitSummary(model, logo);
writeFileSync(process.argv[2] ?? 'empty.pdf', Buffer.from(pdf.output('arraybuffer')));
console.log('OK pages:', pdf.getNumberOfPages());
