// ─── Allergy visit summary renderer ───────────────────────────────────────────
// Draws the clinician export. Geometry and colour are matched to the reference
// document (US Letter, 40.3pt margins, 531.4pt content width, a two-tone
// blue/orange header and footer) so every export looks like the same
// publication regardless of how much data it carries.
//
// This file only draws. Everything it prints comes from clinicalReport.ts, which
// is where the "never state more than the data supports" rules live.
import { jsPDF } from 'jspdf';
import type { ReportModel } from './clinicalReport';
import { minStackedBaselineGap } from './pdfLayout';

// ─── Palette (sampled from the reference document) ────────────────────────────
type RGB = [number, number, number];

const PAGE_BG: RGB = [248, 251, 255];
const BLUE_DARK: RGB = [23, 60, 109];     // page titles, section headings, big values
const BLUE: RGB = [29, 95, 153];          // eyebrow labels, KPI numbers, table header (evidence/meds)
const BLUE_BRAND: RGB = [47, 126, 188];   // gradient bar, bullets, progress fill, wordmark "Immuny"
const ORANGE: RGB = [246, 147, 38];       // gradient bar, pill badge, wordmark "Allergy Ally"
const RUST: RGB = [184, 86, 10];          // reaction-timeline table header, its bullets
const AMBER_BAR: RGB = [232, 168, 31];    // progress fill below 70%
const WHITE: RGB = [255, 255, 255];
const CARD_BORDER: RGB = [212, 228, 240];
const TRACK: RGB = [228, 235, 235];
const PEACH_BG: RGB = [255, 240, 226];        // scope note + questions panel
const PEACH_BORDER: RGB = [216, 209, 244];
const PATTERN_BG: RGB = [244, 249, 253];      // primary pattern panel + blue-table zebra
const PATTERN_BORDER: RGB = [191, 226, 219];
const RUST_ZEBRA: RGB = [255, 240, 226];      // orange-table zebra (same tone as PEACH_BG)
const STRENGTH_BG: RGB = [255, 248, 228];
const STRENGTH_BORDER: RGB = [239, 212, 154];
const ALERT_BG: RGB = [255, 239, 232];
const ALERT_BORDER: RGB = [242, 196, 186];
const TEXT_BODY: RGB = [66, 95, 120];
const TEXT_MUTED: RGB = [111, 132, 150];

// ─── Page metrics ─────────────────────────────────────────────────────────────
const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 40.3;
const CONTENT_W = 531.4;
const RIGHT = MARGIN + CONTENT_W;
const TOPBAR_SPLIT = 465.1;   // blue/orange split of the top gradient bar
const FOOTER_RULE_Y = 767.5;
const BODY_BOTTOM = 745;

// ── Title block rhythm ──────────────────────────────────────────────────────
const EYEBROW_SIZE = 7.5;
const TITLE_SIZE = 24;
const EYEBROW_BASELINE_Y = 89;      // first content line under the header
// A fixed, generously-rounded gap rather than the bare theoretical minimum —
// it's what actually reproduces the reference document's spacing. The test
// suite (pdfLayout.test.ts) asserts this clears minStackedBaselineGap with
// margin, so a future font-size change can't silently reopen the collision
// this replaced (see the block comment in pdfLayout.ts for what that bug was).
const EYEBROW_TITLE_GAP = 32;
if (EYEBROW_TITLE_GAP < minStackedBaselineGap(EYEBROW_SIZE, TITLE_SIZE)) {
  // Defense in depth: fail loudly at render time too, not just in tests, if
  // this constant is ever edited without checking the math.
  throw new Error('exportPdf: EYEBROW_TITLE_GAP is too small — the title would overlap the eyebrow label.');
}

export interface LogoImage {
  dataUrl: string;
  width: number;
  height: number;
}

interface Ctx {
  pdf: jsPDF;
  y: number;
  page: number;
  logo: LogoImage | null;
  footerText: string;
}

// ─── Primitives ───────────────────────────────────────────────────────────────
const fill = (pdf: jsPDF, c: RGB) => pdf.setFillColor(c[0], c[1], c[2]);
const stroke = (pdf: jsPDF, c: RGB) => pdf.setDrawColor(c[0], c[1], c[2]);
const ink = (pdf: jsPDF, c: RGB) => pdf.setTextColor(c[0], c[1], c[2]);

function font(pdf: jsPDF, size: number, weight: 'normal' | 'bold' = 'normal', colour: RGB = TEXT_BODY) {
  pdf.setFont('helvetica', weight);
  pdf.setFontSize(size);
  ink(pdf, colour);
}

function box(pdf: jsPDF, x: number, y: number, w: number, h: number, bg: RGB | null, border: RGB | null, radius = 3) {
  if (bg) fill(pdf, bg);
  if (border) {
    stroke(pdf, border);
    pdf.setLineWidth(0.7);
  }
  const style = bg && border ? 'FD' : bg ? 'F' : 'S';
  pdf.roundedRect(x, y, w, h, radius, radius, style);
}

/** Wrapped text. Returns the height consumed. */
function paragraph(
  pdf: jsPDF,
  text: string,
  x: number,
  y: number,
  w: number,
  opts: { size?: number; weight?: 'normal' | 'bold'; colour?: RGB; leading?: number } = {},
): number {
  const { size = 8.3, weight = 'normal', colour = TEXT_BODY, leading = size * 1.35 } = opts;
  font(pdf, size, weight, colour);
  const lines = pdf.splitTextToSize(text, w) as string[];
  lines.forEach((line, i) => pdf.text(line, x, y + i * leading));
  return lines.length * leading;
}

function measure(pdf: jsPDF, text: string, w: number, size: number, leading = size * 1.35): number {
  pdf.setFontSize(size);
  return (pdf.splitTextToSize(text, w) as string[]).length * leading;
}

/** Two-tone "Immuny" (blue) + "Allergy Ally" (orange) wordmark, as one line. */
function wordmark(pdf: jsPDF, x: number, y: number, size: number, immunyText: string, tagText: string) {
  font(pdf, size, 'bold', BLUE_BRAND);
  pdf.text(immunyText, x, y);
  const w = pdf.getTextWidth(immunyText);
  font(pdf, size, 'bold', ORANGE);
  pdf.text(tagText, x + w, y);
}

// ─── Page furniture ───────────────────────────────────────────────────────────
function drawHeader(ctx: Ctx) {
  const { pdf, logo } = ctx;

  fill(pdf, BLUE_BRAND);
  pdf.rect(0, 0, TOPBAR_SPLIT, 5, 'F');
  fill(pdf, ORANGE);
  pdf.rect(TOPBAR_SPLIT, 0, PAGE_W - TOPBAR_SPLIT, 5, 'F');

  const logoH = 62;
  if (logo) {
    const w = (logo.width / logo.height) * logoH;
    pdf.addImage(logo.dataUrl, 'PNG', MARGIN, 8, w, logoH, undefined, 'FAST');
  } else {
    // Fallback mark, so a failed image load still yields a branded document.
    fill(pdf, BLUE_BRAND);
    pdf.circle(MARGIN + 7, 39, 7, 'F');
    font(pdf, 15, 'bold', BLUE_DARK);
    pdf.text('immuny', MARGIN + 20, 44);
  }

  const titleX = 100.2;
  font(pdf, 12, 'bold', BLUE);
  pdf.text('ALLERGY VISIT SUMMARY', titleX, 33.7);
  wordmark(pdf, titleX, 43.4, 6.2, 'IMMUNY', ' ALLERGY ALLY');

  box(pdf, 479.7, 23, 92, 16, ORANGE, null, 8);
  font(pdf, 6.5, 'bold', WHITE);
  pdf.setCharSpace(0.4);
  pdf.text('CLINICIAN EXPORT', 479.7 + 46, 33, { align: 'center' });
  pdf.setCharSpace(0);
  font(pdf, 5.7, 'normal', TEXT_MUTED);
  pdf.text('SELF-REPORTED EXPORT', RIGHT, 48.3, { align: 'right' });
}

function drawFooter(ctx: Ctx) {
  const { pdf } = ctx;
  stroke(pdf, CARD_BORDER);
  pdf.setLineWidth(0.7);
  pdf.line(MARGIN, FOOTER_RULE_Y, RIGHT, FOOTER_RULE_Y);

  fill(pdf, BLUE_BRAND);
  pdf.rect(MARGIN, 767, 70, 2, 'F');
  fill(pdf, ORANGE);
  pdf.rect(MARGIN + 70, 767, 28, 2, 'F');

  wordmark(pdf, MARGIN, 779, 6.2, 'IMMUNY', ' ALLERGY ALLY');
  const tagWidth = pdf.getTextWidth('IMMUNY ALLERGY ALLY');
  font(pdf, 6.0, 'normal', TEXT_MUTED);
  pdf.text(`  |  ${ctx.footerText}`, MARGIN + tagWidth, 779);
  pdf.text(`Page ${ctx.page}`, RIGHT, 779, { align: 'right' });
}

function paintBackground(pdf: jsPDF) {
  fill(pdf, PAGE_BG);
  pdf.rect(0, 0, PAGE_W, PAGE_H, 'F');
}

function newPage(ctx: Ctx) {
  drawFooter(ctx);
  ctx.pdf.addPage('letter', 'portrait');
  ctx.page += 1;
  paintBackground(ctx.pdf);
  drawHeader(ctx);
  ctx.y = EYEBROW_BASELINE_Y;
}

/** Starts a new page when `needed` points wouldn't fit below the cursor. */
function ensure(ctx: Ctx, needed: number) {
  if (ctx.y + needed > BODY_BOTTOM) newPage(ctx);
}

// ─── Building blocks ──────────────────────────────────────────────────────────
/**
 * The eyebrow label + big page title, always drawn together — this is the
 * only place that gap is decided, which is what stops a future call site
 * from reintroducing the overlap bug by hand-picking its own spacing.
 */
function titleBlock(ctx: Ctx, eyebrowText: string, titleText: string) {
  font(ctx.pdf, EYEBROW_SIZE, 'bold', BLUE);
  ctx.pdf.setCharSpace(0.5);
  ctx.pdf.text(eyebrowText.toUpperCase(), MARGIN, ctx.y);
  ctx.pdf.setCharSpace(0);

  ctx.y += EYEBROW_TITLE_GAP;
  font(ctx.pdf, TITLE_SIZE, 'bold', BLUE_DARK);
  ctx.pdf.text(titleText, MARGIN, ctx.y);
  ctx.y += 12;
}

function sectionHeading(ctx: Ctx, text: string, gapAbove = 22) {
  ensure(ctx, 46);
  ctx.y += gapAbove;
  font(ctx.pdf, 13, 'bold', BLUE_DARK);
  ctx.pdf.text(text, MARGIN, ctx.y);
  ctx.y += 12;
}

/** Title + body inside a tinted panel. Returns the height it drew. */
function panel(
  ctx: Ctx,
  x: number,
  y: number,
  w: number,
  title: string,
  body: string,
  tone: { bg: RGB; border: RGB; titleColour?: RGB; bulletColour?: RGB },
  bullets: string[] = [],
): number {
  const { pdf } = ctx;
  const inner = w - 16;
  const titleH = title ? 13 : 0;
  const bodyH = body ? measure(pdf, body, inner, 8.3) : 0;
  const bulletH = bullets.reduce((n, b) => n + measure(pdf, b, inner - 9, 8.3) + 3, 0);
  const h = 11 + titleH + bodyH + (bullets.length ? bulletH + 4 : 0) + 9;

  box(pdf, x, y, w, h, tone.bg, tone.border);
  let cursor = y + 11 + 8;
  if (title) {
    font(pdf, 9.2, 'bold', tone.titleColour ?? BLUE_DARK);
    pdf.text(title, x + 8, cursor);
    cursor += titleH;
  }
  if (body) cursor += paragraph(pdf, body, x + 8, cursor, inner) + 1;
  for (const b of bullets) {
    fill(pdf, tone.bulletColour ?? BLUE_BRAND);
    pdf.circle(x + 11, cursor - 2.6, 1.5, 'F');
    cursor += paragraph(pdf, b, x + 17, cursor, inner - 9) + 3;
  }
  return h;
}

interface Column {
  header: string;
  width: number;
  align?: 'left' | 'right';
}

function table(ctx: Ctx, columns: Column[], rows: string[][], accent: RGB, zebra: RGB) {
  const { pdf } = ctx;
  const pad = 7;

  const drawHead = () => {
    ensure(ctx, 46);
    box(pdf, MARGIN, ctx.y, CONTENT_W, 20, accent, null, 2);
    font(pdf, 7, 'bold', WHITE);
    pdf.setCharSpace(0.4);
    let x = MARGIN;
    for (const col of columns) {
      pdf.text(col.header.toUpperCase(), x + pad, ctx.y + 13);
      x += col.width;
    }
    pdf.setCharSpace(0);
    ctx.y += 20;
  };

  drawHead();

  rows.forEach((row, index) => {
    const cells = row.map((cell, i) => {
      pdf.setFontSize(8);
      return pdf.splitTextToSize(cell || '—', columns[i].width - pad * 2) as string[];
    });
    const lines = Math.max(...cells.map(c => c.length));
    const h = Math.max(20.5, lines * 10.4 + 10);

    if (ctx.y + h > BODY_BOTTOM) {
      newPage(ctx);
      drawHead();
    }

    box(pdf, MARGIN, ctx.y, CONTENT_W, h, index % 2 === 0 ? WHITE : zebra, null, 0);
    font(pdf, 8, 'normal', TEXT_BODY);
    let x = MARGIN;
    cells.forEach((cellLines, i) => {
      cellLines.forEach((line, li) => pdf.text(line, x + pad, ctx.y + 13.5 + li * 10.4));
      x += columns[i].width;
    });
    ctx.y += h;
  });

  stroke(pdf, CARD_BORDER);
  pdf.setLineWidth(0.7);
  pdf.line(MARGIN, ctx.y, RIGHT, ctx.y);
  ctx.y += 4;
}

/** The four big numbers under the title, or five tolerated-exposure counts. */
function statRow(ctx: Ctx, items: { value: string; label: string }[], valueColour: RGB) {
  if (items.length === 0) return;
  const { pdf } = ctx;
  const gap = 5;
  const w = (CONTENT_W - gap * (items.length - 1)) / items.length;
  const h = 46;
  ensure(ctx, h + 8);

  items.forEach((item, i) => {
    const x = MARGIN + i * (w + gap);
    box(pdf, x, ctx.y, w, h, WHITE, CARD_BORDER);
    font(pdf, 20, 'bold', valueColour);
    pdf.text(item.value, x + w / 2, ctx.y + 24, { align: 'center' });
    font(pdf, 7.5, 'normal', TEXT_MUTED);
    const label = (pdf.splitTextToSize(item.label, w - 8) as string[])[0];
    pdf.text(label, x + w / 2, ctx.y + 38, { align: 'center' });
  });
  ctx.y += h;
}

function completenessBars(ctx: Ctx, items: { label: string; pct: number | null }[]) {
  const { pdf } = ctx;
  const colW = (CONTENT_W - 30) / 2;
  const rows = Math.ceil(items.length / 2);
  const h = rows * 42 + 16;
  ensure(ctx, h + 8);
  box(pdf, MARGIN, ctx.y, CONTENT_W, h, WHITE, CARD_BORDER);

  items.forEach((item, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = MARGIN + 16 + col * (colW + 14);
    const y = ctx.y + 20 + row * 42;
    const barW = colW - 22;

    font(pdf, 8.3, 'normal', TEXT_BODY);
    pdf.text(item.label, x, y);
    font(pdf, 8.3, 'bold', item.pct == null ? TEXT_MUTED : BLUE_DARK);
    pdf.text(item.pct == null ? 'not recorded' : `${item.pct}%`, x + barW, y, { align: 'right' });

    box(pdf, x, y + 6, barW, 5, TRACK, null, 2.5);
    if (item.pct != null && item.pct > 0) {
      // Amber below 70% — the bar is a prompt to collect more, not a score.
      box(pdf, x, y + 6, (barW * item.pct) / 100, 5, item.pct >= 70 ? BLUE_BRAND : AMBER_BAR, null, 2.5);
    }
  });
  ctx.y += h;
}

function ruledNotes(ctx: Ctx, title: string, labels: string[]) {
  const { pdf } = ctx;
  const h = 26 + labels.length * 46;
  ensure(ctx, h + 8);
  box(pdf, MARGIN, ctx.y, CONTENT_W, h, WHITE, CARD_BORDER);
  font(pdf, 13, 'bold', BLUE_DARK);
  pdf.text(title, MARGIN + 16, ctx.y + 24);

  labels.forEach((label, i) => {
    const y = ctx.y + 50 + i * 46;
    font(pdf, 7.5, 'normal', TEXT_MUTED);
    pdf.text(label, MARGIN + 16, y);
    stroke(pdf, CARD_BORDER);
    pdf.setLineWidth(0.7);
    pdf.line(MARGIN + 16, y + 26, RIGHT - 16, y + 26);
  });
  ctx.y += h;
}

// ─── Document ─────────────────────────────────────────────────────────────────
export function renderVisitSummary(model: ReportModel, logo: LogoImage | null): jsPDF {
  const pdf = new jsPDF({ unit: 'pt', format: 'letter', orientation: 'portrait', compress: true });
  pdf.setProperties({
    title: `Allergy visit summary — ${model.patientName}`,
    subject: 'Immuny clinician export',
    creator: 'Immuny',
  });

  const ctx: Ctx = {
    pdf,
    y: 0,
    page: 1,
    logo,
    footerText: `Generated from Immuny for ${model.patientName}, for clinician review, not for diagnosis.`,
  };

  paintBackground(pdf);
  drawHeader(ctx);

  // ── Title block ───────────────────────────────────────────────────────────
  ctx.y = EYEBROW_BASELINE_Y;
  titleBlock(ctx, 'Clinician export', 'Allergy visit summary');
  ctx.y += 20;

  font(pdf, 9.2, 'normal', TEXT_BODY);
  pdf.text(model.patientName, MARGIN, ctx.y);
  pdf.text(model.dobLabel, MARGIN, ctx.y + 12.4);
  font(pdf, 7.5, 'normal', TEXT_MUTED);
  pdf.text(model.periodLabel, RIGHT, ctx.y, { align: 'right' });
  pdf.text(model.preparedLabel, RIGHT, ctx.y + 10, { align: 'right' });
  ctx.y += 30;

  // ── Scope note ────────────────────────────────────────────────────────────
  ctx.y += panel(ctx, MARGIN, ctx.y, CONTENT_W, 'SELF-REPORTED RECORD', model.scopeNote, {
    bg: PEACH_BG,
    border: PEACH_BORDER,
    titleColour: BLUE,
  });
  ctx.y += 13;

  // ── Headline counts ───────────────────────────────────────────────────────
  statRow(ctx, model.kpis, BLUE);

  // ── Primary pattern ───────────────────────────────────────────────────────
  sectionHeading(ctx, 'Primary pattern for review');
  const patternW = CONTENT_W * 0.55;
  const strengthW = CONTENT_W - patternW - 9;
  const patternTop = ctx.y + 8;

  const leftH = panel(ctx, MARGIN, patternTop, patternW, model.pattern.title, model.pattern.summary, {
    bg: PATTERN_BG,
    border: PATTERN_BORDER,
  }, model.pattern.bullets);

  const strengthH = 11 + 12 + 26 + measure(pdf, model.pattern.strengthNote, strengthW - 16, 8.3) + 9;
  box(pdf, MARGIN + patternW + 9, patternTop, strengthW, Math.max(strengthH, 60), STRENGTH_BG, STRENGTH_BORDER);
  font(pdf, 7.5, 'bold', BLUE);
  pdf.setCharSpace(0.4);
  pdf.text('PATTERN STRENGTH', MARGIN + patternW + 17, patternTop + 19);
  pdf.setCharSpace(0);
  font(pdf, 20, 'bold', BLUE_DARK);
  pdf.text(model.pattern.strength, MARGIN + patternW + 17, patternTop + 43);
  paragraph(pdf, model.pattern.strengthNote, MARGIN + patternW + 17, patternTop + 57, strengthW - 24);

  ctx.y = patternTop + Math.max(leftH, strengthH, 60);

  // ── Safety snapshot ───────────────────────────────────────────────────────
  sectionHeading(ctx, 'Safety and symptom snapshot');
  ctx.y += 8;
  const pairW = (CONTENT_W - 9) / 2;
  let safetyRowTop = ctx.y;
  let rowHeight = 0;
  model.safety.forEach((card, i) => {
    const wide = model.safety.length % 2 === 1 && i === model.safety.length - 1;
    const w = wide ? CONTENT_W : pairW;
    const x = wide || i % 2 === 0 ? MARGIN : MARGIN + pairW + 9;
    if (i % 2 === 0 && i > 0) {
      safetyRowTop += rowHeight + 9;
      rowHeight = 0;
    }
    ensure(ctx, 70);
    const h = panel(ctx, x, safetyRowTop, w, card.title, card.body,
      card.tone === 'alert'
        ? { bg: ALERT_BG, border: ALERT_BORDER }
        : { bg: WHITE, border: CARD_BORDER });
    rowHeight = Math.max(rowHeight, h);
  });
  ctx.y = safetyRowTop + rowHeight;

  // ── Clinical context ──────────────────────────────────────────────────────
  ctx.y += 9;
  ctx.y += panel(ctx, MARGIN, ctx.y, CONTENT_W, 'Clinical context', model.clinicalContext, {
    bg: WHITE,
    border: CARD_BORDER,
  });

  // ── Page 2: evidence ──────────────────────────────────────────────────────
  newPage(ctx);
  titleBlock(ctx, 'Pattern evidence', 'What Immuny connected');
  ctx.y += 18;

  table(ctx,
    [
      { header: 'Finding', width: 130 },
      { header: 'Observed evidence', width: 230 },
      { header: 'Interpretation limit', width: CONTENT_W - 360 },
    ],
    model.evidence.map(r => [r.finding, r.observed, r.limit]),
    BLUE, PATTERN_BG);

  sectionHeading(ctx, 'Reaction timeline');
  ctx.y += 8;
  if (model.timeline.length === 0) {
    ctx.y += panel(ctx, MARGIN, ctx.y, CONTENT_W, '',
      'No symptom episode in this period had an exposure logged in the preceding four hours, so no reaction timeline could be built.',
      { bg: WHITE, border: CARD_BORDER });
  } else {
    table(ctx,
      [
        { header: 'Date', width: 62 },
        { header: 'Exposure', width: 140 },
        { header: 'Onset', width: 52 },
        { header: 'Symptoms', width: 130 },
        { header: 'Response / outcome', width: CONTENT_W - 384 },
      ],
      model.timeline.map(r => [r.date, `${r.exposure}\n${r.amount}`, r.onset, r.symptoms, r.response]),
      RUST, RUST_ZEBRA);
  }

  sectionHeading(ctx, 'Tolerated exposures');
  ctx.y += 8;
  if (model.tolerated.length === 0) {
    ctx.y += panel(ctx, MARGIN, ctx.y, CONTENT_W, '',
      'No exposure was logged without a following symptom in this period.',
      { bg: WHITE, border: CARD_BORDER });
  } else {
    statRow(ctx, model.tolerated.map(t => ({ value: t.count, label: `${t.label} — no logged reaction` })), BLUE);
    ctx.y += 8;
    paragraph(pdf, model.toleratedNote, MARGIN, ctx.y + 4, CONTENT_W, { size: 7, colour: TEXT_MUTED });
    ctx.y += measure(pdf, model.toleratedNote, CONTENT_W, 7) + 4;
  }

  sectionHeading(ctx, 'Other activity during this period');
  ctx.y += 8;
  ctx.y += panel(ctx, MARGIN, ctx.y, CONTENT_W, '', '',
    { bg: WHITE, border: CARD_BORDER, bulletColour: RUST }, model.otherActivity);

  // ── Page 3: visit preparation ─────────────────────────────────────────────
  newPage(ctx);
  titleBlock(ctx, 'Visit preparation', 'Treatment, gaps, and next questions');
  ctx.y += 18;

  sectionHeading(ctx, 'Medication and response', 0);
  ctx.y += 8;
  table(ctx,
    [
      { header: 'Medication', width: 150 },
      { header: 'Logged use', width: 90 },
      { header: 'Observed entry', width: CONTENT_W - 240 },
    ],
    model.medications.map(m => [m.name, m.use, m.observed]),
    BLUE, PATTERN_BG);

  if (model.exposureTests.length > 0) {
    sectionHeading(ctx, 'Supervised exposure tests');
    ctx.y += 8;
    table(ctx,
      [
        { header: 'Test', width: 170 },
        { header: 'Date', width: 70 },
        { header: 'Status', width: 80 },
        { header: 'Recorded outcome', width: CONTENT_W - 320 },
      ],
      model.exposureTests.map(t => [t.name, t.date, t.status, t.outcome]),
      BLUE, PATTERN_BG);
  }

  sectionHeading(ctx, 'Data completeness');
  ctx.y += 8;
  completenessBars(ctx, model.completeness);

  sectionHeading(ctx, 'Questions highlighted for the allergist');
  ctx.y += 8;
  const questionsInner = CONTENT_W - 40;
  const questionsH = model.questions.reduce((n, q) => n + measure(pdf, q, questionsInner, 8.3) + 5, 0) + 20;
  ensure(ctx, questionsH + 8);
  box(pdf, MARGIN, ctx.y, CONTENT_W, questionsH, PEACH_BG, PEACH_BORDER);
  let qy = ctx.y + 18;
  model.questions.forEach((q, i) => {
    font(pdf, 8.7, 'bold', BLUE_DARK);
    pdf.text(`${i + 1}.`, MARGIN + 18, qy);
    qy += paragraph(pdf, q, MARGIN + 30, qy, questionsInner, { size: 8.7, colour: BLUE_DARK }) + 5;
  });
  ctx.y += questionsH;

  ctx.y += 9;
  ruledNotes(ctx, 'Clinician notes', ['Assessment', 'Testing / evaluation plan', 'Updated action plan and follow-up']);

  ctx.y += 16;
  ensure(ctx, 60);
  font(pdf, 8.3, 'bold', BLUE_DARK);
  pdf.text('Method note', MARGIN, ctx.y);
  ctx.y += 11;
  ctx.y += paragraph(pdf, model.methodNote, MARGIN, ctx.y, CONTENT_W, { size: 7, colour: TEXT_MUTED }) + 6;
  paragraph(pdf, model.referenceNote, MARGIN, ctx.y, CONTENT_W, { size: 7, colour: TEXT_MUTED });

  drawFooter(ctx);
  return pdf;
}

// ─── Logo loading ─────────────────────────────────────────────────────────────
/**
 * Loads the Immuny logo and trims its transparent/near-white margin, so the
 * mark sits on the header baseline instead of floating inside its own padding.
 */
export async function loadLogo(url: string): Promise<LogoImage | null> {
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.crossOrigin = 'anonymous';
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('logo load failed'));
      el.src = url;
    });

    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0);

    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let top = canvas.height, left = canvas.width, right = 0, bottom = 0;
    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        const i = (y * canvas.width + x) * 4;
        const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
        const blank = a < 12 || (r > 242 && g > 242 && b > 242);
        if (!blank) {
          if (x < left) left = x;
          if (x > right) right = x;
          if (y < top) top = y;
          if (y > bottom) bottom = y;
        }
      }
    }
    if (right <= left || bottom <= top) return null;

    const w = right - left + 1;
    const h = bottom - top + 1;
    const out = document.createElement('canvas');
    out.width = w;
    out.height = h;
    const outCtx = out.getContext('2d');
    if (!outCtx) return null;
    outCtx.drawImage(canvas, left, top, w, h, 0, 0, w, h);
    return { dataUrl: out.toDataURL('image/png'), width: w, height: h };
  } catch {
    return null;   // the renderer falls back to a drawn wordmark
  }
}

export function downloadVisitSummary(model: ReportModel, logo: LogoImage | null): void {
  const pdf = renderVisitSummary(model, logo);
  const safeName = model.patientName.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'patient';
  const stamp = new Date().toISOString().slice(0, 10);
  pdf.save(`immuny-allergy-visit-summary-${safeName}-${stamp}.pdf`);
}
