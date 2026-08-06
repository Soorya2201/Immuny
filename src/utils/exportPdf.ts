// ─── Allergy visit summary renderer ───────────────────────────────────────────
// Draws the clinician export. Geometry and colour are matched to the reference
// document (US Letter, 40.3pt margins, 531.4pt content width) so every export
// looks like the same publication regardless of how much data it carries.
//
// This file only draws. Everything it prints comes from clinicalReport.ts, which
// is where the "never state more than the data supports" rules live.
import { jsPDF } from 'jspdf';
import type { ReportModel } from './clinicalReport';

// ─── Palette (sampled from the reference document) ────────────────────────────
type RGB = [number, number, number];

const PAGE_BG: RGB = [246, 249, 249];
const TEAL_DARK: RGB = [8, 112, 107];
const TEAL: RGB = [14, 142, 135];
const PURPLE: RGB = [117, 103, 200];
const MINT: RGB = [244, 251, 249];
const MINT_BORDER: RGB = [191, 226, 220];
const LAVENDER: RGB = [239, 237, 251];
const LAVENDER_BORDER: RGB = [216, 209, 245];
const WHITE: RGB = [255, 255, 255];
const BORDER: RGB = [217, 230, 228];
const TRACK: RGB = [228, 235, 235];
const AMBER: RGB = [200, 144, 47];
const AMBER_BG: RGB = [255, 247, 232];
const AMBER_BORDER: RGB = [240, 212, 154];
const ALERT_BG: RGB = [255, 241, 237];
const ALERT_BORDER: RGB = [242, 197, 186];
const TEXT_DARK: RGB = [24, 51, 58];
const TEXT_BODY: RGB = [75, 98, 103];
const TEXT_MUTED: RGB = [113, 134, 138];

// ─── Page metrics ─────────────────────────────────────────────────────────────
const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 40.3;
const CONTENT_W = 531.4;
const RIGHT = MARGIN + CONTENT_W;
const HEADER_BOTTOM = 52;
const FOOTER_RULE_Y = 767.5;
const BODY_BOTTOM = 745;

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
  headerLabel: string;
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

// ─── Page furniture ───────────────────────────────────────────────────────────
function drawHeader(ctx: Ctx) {
  const { pdf, logo } = ctx;

  if (logo) {
    // The Immuny mark is a mascot + wordmark lockup (~1.6:1), much squarer
    // than the reference document's slim icon+text header. Sizing by height
    // alone at that ratio renders the wordmark unreadably small, so the mark
    // gets a taller allowance — still comfortably inside the 52pt header band
    // — capped by width only as a backstop for an unexpectedly wide asset.
    const targetH = 34;
    const w = Math.min((logo.width / logo.height) * targetH, 150);
    const h = w / (logo.width / logo.height);
    pdf.addImage(logo.dataUrl, 'PNG', MARGIN, (HEADER_BOTTOM - h) / 2, w, h, undefined, 'FAST');
  } else {
    // Fallback mark, so a failed image load still yields a branded document.
    fill(pdf, TEAL);
    pdf.circle(MARGIN + 7, 25, 7, 'F');
    font(pdf, 15, 'bold', TEXT_DARK);
    pdf.text('immuny', MARGIN + 20, 30);
  }

  font(pdf, 6.8, 'normal', TEXT_MUTED);
  pdf.text(ctx.headerLabel, RIGHT, 27, { align: 'right' });
}

function drawFooter(ctx: Ctx) {
  const { pdf } = ctx;
  stroke(pdf, BORDER);
  pdf.setLineWidth(0.7);
  pdf.line(MARGIN, FOOTER_RULE_Y, RIGHT, FOOTER_RULE_Y);
  font(pdf, 6.5, 'normal', TEXT_MUTED);
  pdf.text(ctx.footerText, MARGIN, 777);
  pdf.text(`Page ${ctx.page}`, RIGHT, 777, { align: 'right' });
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
  ctx.y = HEADER_BOTTOM + 18;
}

/** Starts a new page when `needed` points wouldn't fit below the cursor. */
function ensure(ctx: Ctx, needed: number) {
  if (ctx.y + needed > BODY_BOTTOM) newPage(ctx);
}

// ─── Building blocks ──────────────────────────────────────────────────────────
function eyebrow(ctx: Ctx, text: string) {
  font(ctx.pdf, 7.5, 'bold', TEAL_DARK);
  ctx.pdf.setCharSpace(0.5);
  ctx.pdf.text(text.toUpperCase(), MARGIN, ctx.y);
  ctx.pdf.setCharSpace(0);
  ctx.y += 17;
}

function pageTitle(ctx: Ctx, text: string) {
  font(ctx.pdf, 24, 'bold', TEXT_DARK);
  ctx.pdf.text(text, MARGIN, ctx.y);
  ctx.y += 12;
}

function sectionHeading(ctx: Ctx, text: string, gapAbove = 22) {
  ensure(ctx, 46);
  ctx.y += gapAbove;
  font(ctx.pdf, 13, 'bold', TEXT_DARK);
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
  tone: { bg: RGB; border: RGB; titleColour?: RGB },
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
    font(pdf, 9.2, 'bold', tone.titleColour ?? TEXT_DARK);
    pdf.text(title, x + 8, cursor);
    cursor += titleH;
  }
  if (body) cursor += paragraph(pdf, body, x + 8, cursor, inner) + 1;
  for (const b of bullets) {
    fill(pdf, tone.titleColour ?? TEAL);
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

  stroke(pdf, BORDER);
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
    box(pdf, x, ctx.y, w, h, WHITE, BORDER);
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
  box(pdf, MARGIN, ctx.y, CONTENT_W, h, WHITE, BORDER);

  items.forEach((item, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = MARGIN + 16 + col * (colW + 14);
    const y = ctx.y + 20 + row * 42;
    const barW = colW - 22;

    font(pdf, 8.3, 'normal', TEXT_BODY);
    pdf.text(item.label, x, y);
    font(pdf, 8.3, 'bold', item.pct == null ? TEXT_MUTED : TEXT_DARK);
    pdf.text(item.pct == null ? 'not recorded' : `${item.pct}%`, x + barW, y, { align: 'right' });

    box(pdf, x, y + 6, barW, 5, TRACK, null, 2.5);
    if (item.pct != null && item.pct > 0) {
      // Amber below 70% — the bar is a prompt to collect more, not a score.
      box(pdf, x, y + 6, (barW * item.pct) / 100, 5, item.pct >= 70 ? TEAL : AMBER, null, 2.5);
    }
  });
  ctx.y += h;
}

function ruledNotes(ctx: Ctx, title: string, labels: string[]) {
  const { pdf } = ctx;
  const h = 26 + labels.length * 46;
  ensure(ctx, h + 8);
  box(pdf, MARGIN, ctx.y, CONTENT_W, h, WHITE, BORDER);
  font(pdf, 13, 'bold', TEXT_DARK);
  pdf.text(title, MARGIN + 16, ctx.y + 24);

  labels.forEach((label, i) => {
    const y = ctx.y + 50 + i * 46;
    font(pdf, 7.5, 'normal', TEXT_MUTED);
    pdf.text(label, MARGIN + 16, y);
    stroke(pdf, BORDER);
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
    headerLabel: `ALLERGY VISIT SUMMARY  /  ${model.patientName.toUpperCase()}`,
    footerText: `Generated from Immuny for ${model.patientName}, for clinician review, not for diagnosis.`,
  };

  paintBackground(pdf);
  drawHeader(ctx);

  // ── Title block ───────────────────────────────────────────────────────────
  ctx.y = 68;
  eyebrow(ctx, 'Clinician export');
  pageTitle(ctx, 'Allergy visit summary');
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
    bg: LAVENDER,
    border: LAVENDER_BORDER,
    titleColour: PURPLE,
  });
  ctx.y += 13;

  // ── Headline counts ───────────────────────────────────────────────────────
  statRow(ctx, model.kpis, TEAL);

  // ── Primary pattern ───────────────────────────────────────────────────────
  sectionHeading(ctx, 'Primary pattern for review');
  const patternW = CONTENT_W * 0.55;
  const strengthW = CONTENT_W - patternW - 9;
  const patternTop = ctx.y + 8;

  const leftH = panel(ctx, MARGIN, patternTop, patternW, model.pattern.title, model.pattern.summary, {
    bg: MINT,
    border: MINT_BORDER,
  }, model.pattern.bullets);

  const strengthH = 11 + 12 + 26 + measure(pdf, model.pattern.strengthNote, strengthW - 16, 8.3) + 9;
  box(pdf, MARGIN + patternW + 9, patternTop, strengthW, Math.max(strengthH, 60), AMBER_BG, AMBER_BORDER);
  font(pdf, 7.5, 'bold', AMBER);
  pdf.setCharSpace(0.4);
  pdf.text('PATTERN STRENGTH', MARGIN + patternW + 17, patternTop + 19);
  pdf.setCharSpace(0);
  font(pdf, 20, 'bold', TEXT_DARK);
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
        : { bg: WHITE, border: BORDER });
    rowHeight = Math.max(rowHeight, h);
  });
  ctx.y = safetyRowTop + rowHeight;

  // ── Clinical context ──────────────────────────────────────────────────────
  ctx.y += 9;
  ctx.y += panel(ctx, MARGIN, ctx.y, CONTENT_W, 'Clinical context', model.clinicalContext, {
    bg: WHITE,
    border: BORDER,
  });

  // ── Page 2: evidence ──────────────────────────────────────────────────────
  newPage(ctx);
  ctx.y = 70;
  eyebrow(ctx, 'Pattern evidence');
  pageTitle(ctx, 'What Immuny connected');
  ctx.y += 18;

  table(ctx,
    [
      { header: 'Finding', width: 130 },
      { header: 'Observed evidence', width: 230 },
      { header: 'Interpretation limit', width: CONTENT_W - 360 },
    ],
    model.evidence.map(r => [r.finding, r.observed, r.limit]),
    TEAL_DARK, MINT);

  sectionHeading(ctx, 'Reaction timeline');
  ctx.y += 8;
  if (model.timeline.length === 0) {
    ctx.y += panel(ctx, MARGIN, ctx.y, CONTENT_W, '',
      'No symptom episode in this period had an exposure logged in the preceding four hours, so no reaction timeline could be built.',
      { bg: WHITE, border: BORDER });
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
      PURPLE, LAVENDER);
  }

  sectionHeading(ctx, 'Tolerated exposures');
  ctx.y += 8;
  if (model.tolerated.length === 0) {
    ctx.y += panel(ctx, MARGIN, ctx.y, CONTENT_W, '',
      'No exposure was logged without a following symptom in this period.',
      { bg: WHITE, border: BORDER });
  } else {
    statRow(ctx, model.tolerated.map(t => ({ value: t.count, label: `${t.label} — no logged reaction` })), TEAL);
    ctx.y += 8;
    paragraph(pdf, model.toleratedNote, MARGIN, ctx.y + 4, CONTENT_W, { size: 7, colour: TEXT_MUTED });
    ctx.y += measure(pdf, model.toleratedNote, CONTENT_W, 7) + 4;
  }

  sectionHeading(ctx, 'Other activity during this period');
  ctx.y += 8;
  ctx.y += panel(ctx, MARGIN, ctx.y, CONTENT_W, '', '', { bg: WHITE, border: BORDER, titleColour: PURPLE }, model.otherActivity);

  // ── Page 3: visit preparation ─────────────────────────────────────────────
  newPage(ctx);
  ctx.y = 70;
  eyebrow(ctx, 'Visit preparation');
  pageTitle(ctx, 'Treatment, gaps, and next questions');
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
    TEAL_DARK, MINT);

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
      TEAL_DARK, MINT);
  }

  sectionHeading(ctx, 'Data completeness');
  ctx.y += 8;
  completenessBars(ctx, model.completeness);

  sectionHeading(ctx, 'Questions highlighted for the allergist');
  ctx.y += 8;
  const questionsInner = CONTENT_W - 40;
  const questionsH = model.questions.reduce((n, q) => n + measure(pdf, q, questionsInner, 8.3) + 5, 0) + 20;
  ensure(ctx, questionsH + 8);
  box(pdf, MARGIN, ctx.y, CONTENT_W, questionsH, LAVENDER, LAVENDER_BORDER);
  let qy = ctx.y + 18;
  model.questions.forEach((q, i) => {
    font(pdf, 8.3, 'bold', PURPLE);
    pdf.text(`${i + 1}.`, MARGIN + 18, qy);
    qy += paragraph(pdf, q, MARGIN + 30, qy, questionsInner) + 5;
  });
  ctx.y += questionsH;

  ctx.y += 9;
  ruledNotes(ctx, 'Clinician notes', ['Assessment', 'Testing / evaluation plan', 'Updated action plan and follow-up']);

  ctx.y += 16;
  ensure(ctx, 60);
  font(pdf, 8.3, 'bold', TEXT_DARK);
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
