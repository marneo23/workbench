import {
  PDFDocument,
  PDFFont,
  PDFPage,
  StandardFonts,
  degrees,
  rgb,
} from "pdf-lib";
import type { FurnitureSpec } from "@/lib/spec/schema";
import {
  isoWireframe,
  projectView,
  rectsToSegments,
  type ViewName,
} from "./projections";
import { boundaries, chain } from "./dimensions";
import { buildCutList } from "@/lib/cutlist";

/**
 * A4-landscape, 3-page carpenter drawing:
 *   1. title page — vector isometric + title block
 *   2. plan / front / side at a standard scale with full dimension chains
 *   3. cut list grouped by material + dimensions
 * Everything is drawn from the spec's numbers; nothing is rasterized.
 */

const MM = 72 / 25.4; // pt per mm
const PAGE_W = 297 * MM;
const PAGE_H = 210 * MM;

const INK = rgb(0.12, 0.14, 0.17);
const MUTED = rgb(0.45, 0.5, 0.55);
const ACCENT = rgb(0.72, 0.45, 0.2);

const STANDARD_SCALES = [5, 8, 10, 20];
const MARGIN = 12; // mm
const CHAIN_BAND = 22; // mm reserved beside a view for its chains
const VIEW_GAP = 14; // mm between views

interface Fonts {
  regular: PDFFont;
  bold: PDFFont;
}

function line(
  page: PDFPage,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  thickness: number,
  color = INK
) {
  page.drawLine({
    start: { x: x1 * MM, y: y1 * MM },
    end: { x: x2 * MM, y: y2 * MM },
    thickness,
    color,
  });
}

function text(
  page: PDFPage,
  str: string,
  xMm: number,
  yMm: number,
  size: number,
  font: PDFFont,
  color = INK,
  rotateDeg = 0
) {
  page.drawText(str, {
    x: xMm * MM,
    y: yMm * MM,
    size,
    font,
    color,
    rotate: degrees(rotateDeg),
  });
}

function formatMm(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

/** Largest standard scale whose three-view layout fits the printable area. */
export function pickScale(spec: FurnitureSpec): number {
  const { w, h, d } = spec.bbox;
  for (const s of STANDARD_SCALES) {
    const needW = CHAIN_BAND + w / s + VIEW_GAP + d / s + CHAIN_BAND;
    const needH = CHAIN_BAND + d / s + VIEW_GAP + h / s + CHAIN_BAND;
    if (needW <= 297 - 2 * MARGIN && needH <= 210 - 2 * MARGIN) return s;
  }
  return STANDARD_SCALES[STANDARD_SCALES.length - 1];
}

/** Part edges thin, overall outline heavy. Origin/sizes in paper mm. */
function drawView(
  page: PDFPage,
  spec: FurnitureSpec,
  view: ViewName,
  originX: number,
  originY: number,
  scale: number
) {
  const projection = projectView(spec, view);
  for (const s of rectsToSegments(projection.rects)) {
    line(
      page,
      originX + s.x1 / scale,
      originY + s.y1 / scale,
      originX + s.x2 / scale,
      originY + s.y2 / scale,
      0.5
    );
  }
  const w = projection.width / scale;
  const h = projection.height / scale;
  line(page, originX, originY, originX + w, originY, 1.1);
  line(page, originX, originY + h, originX + w, originY + h, 1.1);
  line(page, originX, originY, originX, originY + h, 1.1);
  line(page, originX + w, originY, originX + w, originY + h, 1.1);
}

interface ChainOpts {
  page: PDFPage;
  fonts: Fonts;
  /** model-space boundary coordinates along this axis, mm */
  bounds: number[];
  scale: number;
  /** paper-mm origin of the view edge the chain runs along */
  viewX: number;
  viewY: number;
  /** paper-mm length of the view along the chain */
  viewExtent: number;
  placement: "bottom" | "left" | "right" | "top";
  /** paper-mm size of the view perpendicular to the chain (for top/right) */
  viewDepth: number;
}

const CHAIN_OFFSET = 7; // mm from view edge to chain line
const OVERALL_OFFSET = 15; // mm from view edge to overall dimension line
const TICK = 1.1; // mm half-length of the 45° tick slash
const LABEL_SIZE = 5.5;

/**
 * One dimension chain (ticks at every part boundary, label per segment) plus
 * the overall dimension further out. Complete and deterministic — labels for
 * narrow segments drop to the far side of the chain line.
 */
function drawChain(opts: ChainOpts) {
  const { page, fonts, bounds, scale, viewX, viewY, viewExtent, placement, viewDepth } = opts;
  const segments = chain(bounds);
  const overall = bounds[bounds.length - 1] - bounds[0];
  const horizontal = placement === "bottom" || placement === "top";
  // +1 = chain sits on the positive side of the view (top/right)
  const dir = placement === "top" || placement === "right" ? 1 : -1;

  // perpendicular positions of the chain and overall lines, paper mm
  const base = horizontal
    ? placement === "top"
      ? viewY + viewDepth
      : viewY
    : placement === "right"
      ? viewX + viewDepth
      : viewX;
  const chainPos = base + dir * CHAIN_OFFSET;
  const overallPos = base + dir * OVERALL_OFFSET;

  const along = (modelCoord: number) =>
    (horizontal ? viewX : viewY) + modelCoord / scale;

  // extension lines from the view edge out past the overall line
  for (const b of bounds) {
    const a = along(b);
    if (horizontal) {
      line(page, a, base + dir * 1.5, a, overallPos + dir * 1.5, 0.25, MUTED);
    } else {
      line(page, base + dir * 1.5, a, overallPos + dir * 1.5, a, 0.25, MUTED);
    }
  }

  const drawTicksAndLine = (pos: number, ticks: number[]) => {
    const a0 = along(ticks[0]);
    const a1 = along(ticks[ticks.length - 1]);
    if (horizontal) line(page, a0, pos, a1, pos, 0.4);
    else line(page, pos, a0, pos, a1, 0.4);
    for (const t of ticks) {
      const a = along(t);
      if (horizontal) line(page, a - TICK, pos - TICK, a + TICK, pos + TICK, 0.6);
      else line(page, pos - TICK, a - TICK, pos + TICK, a + TICK, 0.6);
    }
  };

  drawTicksAndLine(chainPos, bounds);
  drawTicksAndLine(overallPos, [bounds[0], bounds[bounds.length - 1]]);

  const label = (
    value: number,
    midModel: number,
    linePos: number,
    paperLen: number
  ) => {
    const str = formatMm(value);
    const wText = fonts.regular.widthOfTextAtSize(str, LABEL_SIZE) / MM;
    const hText = LABEL_SIZE * 0.9 * 0.3528; // pt→mm cap height approx
    const mid = along(midModel);
    const fits = wText + 1.5 <= paperLen;
    if (horizontal) {
      // normal: just above the line (relative to dir); narrow: on the far side
      const y = fits ? linePos + dir * 1.2 : linePos - dir * (1.2 + hText);
      text(page, str, mid - wText / 2, dir === -1 ? y - (fits ? hText : 0) : y, LABEL_SIZE, fonts.regular);
    } else {
      const x = fits ? linePos - dir * 1.2 : linePos + dir * (1.2 + hText);
      // rotated 90°: anchor is bottom-left of rotated text → offset along the chain
      text(
        page,
        str,
        dir === -1 ? x + (fits ? hText : 0) : x,
        mid - wText / 2,
        LABEL_SIZE,
        fonts.regular,
        INK,
        90
      );
    }
  };

  for (const s of segments) {
    label(s.length, (s.from + s.to) / 2, chainPos, (s.to - s.from) / scale);
  }
  label(overall, (bounds[0] + bounds[bounds.length - 1]) / 2, overallPos, viewExtent);
}

function drawTitlePage(page: PDFPage, spec: FurnitureSpec, fonts: Fonts) {
  const partCount = spec.parts.length;
  text(page, spec.name.toUpperCase(), 15, 188, 24, fonts.bold);
  text(
    page,
    `${formatMm(spec.bbox.w)} × ${formatMm(spec.bbox.h)} × ${formatMm(spec.bbox.d)} mm  ·  ${partCount} parts`,
    15,
    179,
    11,
    fonts.regular,
    MUTED
  );

  // isometric wireframe fitted to the left region
  const iso = isoWireframe(spec);
  const regionX = 15;
  const regionY = 30;
  const regionW = 170;
  const regionH = 138;
  const isoW = iso.maxX - iso.minX;
  const isoH = iso.maxY - iso.minY;
  const s = Math.max(isoW / regionW, isoH / regionH);
  const ox = regionX + (regionW - isoW / s) / 2 - iso.minX / s;
  const oy = regionY + (regionH - isoH / s) / 2 - iso.minY / s;
  for (const seg of iso.segments) {
    line(page, ox + seg.x1 / s, oy + seg.y1 / s, ox + seg.x2 / s, oy + seg.y2 / s, 0.55);
  }

  // title block
  const bx = 200;
  const by = 15;
  const bw = 82;
  const bh = 58;
  page.drawRectangle({
    x: bx * MM,
    y: by * MM,
    width: bw * MM,
    height: bh * MM,
    borderColor: INK,
    borderWidth: 1,
  });
  text(page, "WORKBENCH", bx + 4, by + bh - 8, 10, fonts.bold, ACCENT);
  const rows: [string, string][] = [
    ["Piece", spec.name],
    ["Overall", `${formatMm(spec.bbox.w)} × ${formatMm(spec.bbox.h)} × ${formatMm(spec.bbox.d)} mm`],
    ["Units", "millimetres"],
    ["Date", new Date().toISOString().slice(0, 10)],
  ];
  rows.forEach(([k, v], i) => {
    const y = by + bh - 17 - i * 7;
    text(page, k, bx + 4, y, 6, fonts.regular, MUTED);
    text(page, v, bx + 24, y, 7, fonts.regular);
  });
  text(page, "Measured from your model,", bx + 4, by + 10, 7, fonts.bold);
  text(page, "not drawn by AI.", bx + 4, by + 5.5, 7, fonts.bold);

  if (spec.notes) {
    const noteLines = wrapText(spec.notes, fonts.regular, 8, 90);
    noteLines.slice(0, 6).forEach((l, i) => {
      text(page, l, 200, 110 - i * 4.5, 8, fonts.regular, MUTED);
    });
  }
}

function drawViewsPage(page: PDFPage, spec: FurnitureSpec, fonts: Fonts, scale: number) {
  const { w, h, d } = spec.bbox;
  const usedW = CHAIN_BAND + w / scale + VIEW_GAP + d / scale + CHAIN_BAND;
  const usedH = CHAIN_BAND + d / scale + VIEW_GAP + h / scale + CHAIN_BAND;
  const startX = (297 - usedW) / 2 + CHAIN_BAND;
  const startY = (210 - usedH) / 2 + CHAIN_BAND;

  const frontX = startX;
  const frontY = startY;
  const sideX = startX + w / scale + VIEW_GAP;
  const planX = startX;
  const planY = startY + h / scale + VIEW_GAP;

  drawView(page, spec, "front", frontX, frontY, scale);
  drawView(page, spec, "side", sideX, frontY, scale);
  drawView(page, spec, "plan", planX, planY, scale);

  const caption = (label: string, x: number, y: number) =>
    text(page, label, x, y, 7, fonts.bold, MUTED);
  caption("FRONT", frontX, frontY + h / scale + 1.5);
  caption("SIDE", sideX, frontY + h / scale + 1.5);
  caption("PLAN", planX + w / scale + 2, planY + (d / scale) / 2 - 1);

  // front: bottom (x boundaries) + left (y boundaries)
  drawChain({
    page, fonts, scale,
    bounds: boundaries(spec, "front", "horizontal"),
    viewX: frontX, viewY: frontY,
    viewExtent: w / scale, viewDepth: h / scale,
    placement: "bottom",
  });
  drawChain({
    page, fonts, scale,
    bounds: boundaries(spec, "front", "vertical"),
    viewX: frontX, viewY: frontY,
    viewExtent: h / scale, viewDepth: w / scale,
    placement: "left",
  });
  // side: bottom (z boundaries) + right (y boundaries)
  drawChain({
    page, fonts, scale,
    bounds: boundaries(spec, "side", "horizontal"),
    viewX: sideX, viewY: frontY,
    viewExtent: d / scale, viewDepth: h / scale,
    placement: "bottom",
  });
  drawChain({
    page, fonts, scale,
    bounds: boundaries(spec, "side", "vertical"),
    viewX: sideX, viewY: frontY,
    viewExtent: h / scale, viewDepth: d / scale,
    placement: "right",
  });
  // plan: top (x boundaries) + left (z boundaries)
  drawChain({
    page, fonts, scale,
    bounds: boundaries(spec, "plan", "horizontal"),
    viewX: planX, viewY: planY,
    viewExtent: w / scale, viewDepth: d / scale,
    placement: "top",
  });
  drawChain({
    page, fonts, scale,
    bounds: boundaries(spec, "plan", "vertical"),
    viewX: planX, viewY: planY,
    viewExtent: d / scale, viewDepth: w / scale,
    placement: "left",
  });

  text(
    page,
    `${spec.name} — plan · front · side   |   scale 1:${scale} on A4   |   all dimensions in mm`,
    MARGIN,
    5,
    7,
    fonts.regular,
    MUTED
  );
}

function wrapText(str: string, font: PDFFont, size: number, maxMm: number): string[] {
  const words = str.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) / MM > maxMm && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function drawCutListPage(page: PDFPage, spec: FurnitureSpec, fonts: Fonts) {
  text(page, `CUT LIST — ${spec.name.toUpperCase()}`, 15, 190, 14, fonts.bold);
  text(page, "all dimensions in mm · L × W is the cut face, thickness is the sheet", 15, 183, 8, fonts.regular, MUTED);

  const rows = buildCutList(spec);
  const cols = [
    { key: "qty", label: "QTY", x: 15 },
    { key: "name", label: "PART", x: 30 },
    { key: "material", label: "MATERIAL", x: 105 },
    { key: "thickness", label: "THK", x: 170 },
    { key: "length", label: "LENGTH", x: 190 },
    { key: "width", label: "WIDTH", x: 215 },
    { key: "grain", label: "GRAIN", x: 240 },
  ];

  const headerY = 174;
  for (const c of cols) text(page, c.label, c.x, headerY, 7, fonts.bold, MUTED);
  line(page, 15, headerY - 2, 282, headerY - 2, 0.8);

  let y = headerY - 9;
  for (const r of rows) {
    const names = wrapText(r.names.join(", "), fonts.regular, 8, 70)[0] ?? "";
    text(page, String(r.qty), 15, y, 8, fonts.regular);
    text(page, names, 30, y, 8, fonts.regular);
    text(page, r.materialName, 105, y, 8, fonts.regular);
    text(page, formatMm(r.thickness), 170, y, 8, fonts.regular);
    text(page, formatMm(r.length), 190, y, 8, fonts.regular);
    text(page, formatMm(r.width), 215, y, 8, fonts.regular);
    text(page, r.grain, 240, y, 8, fonts.regular);
    line(page, 15, y - 2.5, 282, y - 2.5, 0.2, MUTED);
    y -= 8;
    if (y < 40) break; // v1: one page of rows (60-part cap keeps this rare)
  }

  // totals
  const totalPieces = rows.reduce((acc, r) => acc + r.qty, 0);
  let ty = y - 6;
  text(page, `Total pieces: ${totalPieces}`, 15, ty, 9, fonts.bold);
  const byMaterial = new Map<string, number>();
  for (const r of rows) {
    byMaterial.set(
      r.materialName,
      (byMaterial.get(r.materialName) ?? 0) + (r.length * r.width * r.qty) / 1e6
    );
  }
  for (const [name, area] of byMaterial) {
    ty -= 6;
    text(page, `${name}: ~${area.toFixed(2)} m² of cut faces`, 15, ty, 8, fonts.regular, MUTED);
  }
}

export async function generateFurniturePdf(spec: FurnitureSpec): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`${spec.name} — Workbench drawing`);
  const fonts: Fonts = {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
  };

  const scale = pickScale(spec);

  drawTitlePage(doc.addPage([PAGE_W, PAGE_H]), spec, fonts);
  drawViewsPage(doc.addPage([PAGE_W, PAGE_H]), spec, fonts, scale);
  drawCutListPage(doc.addPage([PAGE_W, PAGE_H]), spec, fonts);

  return doc.save();
}
