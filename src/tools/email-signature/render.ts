/**
 * Canvas renderer for the PNG export.
 *
 * A second renderer over the same model as ./signature.ts. It exists
 * because the HTML export cannot be pixel-faithful everywhere: Outlook's
 * Word engine drops border-radius and background images. The PNG is the
 * escape hatch for when the look matters more than clickable links, so
 * it renders the design at full strength — real radial glows, a faded
 * divider, hairline-bordered chips — with no client to degrade for.
 *
 * Geometry mirrors the HTML's proportions so the two read as the same
 * signature, not as two different designs.
 */

import {
  type BackdropMode,
  BRAND_COLUMN_WIDTH,
  brandColumnWidth,
  chipWidth,
  clampLogoWidth,
  CONTACT_COLUMN_WIDTHS,
  deriveContactItems,
  DETAILS_COLUMN_WIDTH,
  estimateTextWidth,
  layoutChipRows,
  layoutContactRows,
  METRICS,
  mixHex,
  parseLinks,
  SIGNATURE_WIDTH,
  TYPE,
  type ContactItem,
  type Palette,
  type SignatureData,
  type SignatureLink,
  type TypeStyle,
} from "./signature";

export { BRAND_COLUMN_WIDTH };

/**
 * The card is drawn at exactly the width the HTML renders at, not at an
 * arbitrary larger size. Resolution comes from the `scale` multiplier in
 * renderSignatureBlob instead. Drawing a wider canvas at the same font
 * sizes is what made every line except the name unreadable in the export.
 */
/**
 * No margin around the card. It was transparent, so it looked like empty
 * space, but it still counted toward the image's width: a client fitting
 * the image to its column shrank the card further to make room for it.
 */
export const OUTER_MARGIN = 0;
export const CANVAS_WIDTH = SIGNATURE_WIDTH + OUTER_MARGIN * 2;
export const CARD_RADIUS = METRICS.cardRadius;
export const CARD_PADDING_X = METRICS.cardPaddingX;
export const CARD_PADDING_Y = METRICS.cardPaddingY;
/** Both column gaps plus the divider between them. */
export const COLUMN_GUTTER = METRICS.columnGap * 2 + METRICS.dividerWidth;

/**
 * Canvas resolves this like any CSS font-family list, so the PNG picks up
 * the same native UI face the HTML asks for instead of falling back to a
 * generic sans.
 */
export const CANVAS_FONT =
  "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Helvetica, Arial, sans-serif";

// Every value below comes from the shared scale in ./signature.ts. None
// of them may be a literal: a number typed here is a number that will
// drift away from the HTML output.
const NAME_LINE = TYPE.name.line;
const ROLE_LINE = TYPE.role.line;
const ROLE_GAP = METRICS.roleGap;
const CONTACT_GAP = METRICS.contactsGap;
const LABEL_LINE = TYPE.label.line;
const LABEL_GAP = METRICS.labelGap;
const CONTACT_LINE = TYPE.value.line;
const CONTACT_ROW_GAP = METRICS.contactRowGap;
const CHIP_HEIGHT = TYPE.chip.line + METRICS.chipPaddingY * 2 + 2;
const CHIP_ROW_GAP = METRICS.chipRowGap;
const CHIPS_GAP = METRICS.chipsGap;
const RULE_BLOCK = METRICS.ruleGapAbove + 2 + METRICS.ruleGapBelow;
const TAGLINE_LINE = TYPE.tagline.line;
const TAGLINE_GAP = METRICS.taglineGap;
const FALLBACK_MARK_LINE = TYPE.company.line;
/** Ratio used when the logo's real aspect is unknown (no image loaded). */
const DEFAULT_LOGO_ASPECT = 0.28;

export interface SignatureLayout {
  width: number;
  height: number;
  cardX: number;
  cardY: number;
  cardWidth: number;
  cardHeight: number;
  brandCenterX: number;
  dividerX: number;
  detailsX: number;
  detailsWidth: number;
  contentTop: number;
  contentHeight: number;
  brandHeight: number;
  detailsHeight: number;
  logoWidth: number;
  logoHeight: number;
  contacts: ContactItem[];
  links: SignatureLink[];
  /** Everything below is already wrapped to fit its column. */
  nameLines: string[];
  roleLines: string[];
  taglineLines: string[];
  contactRows: ContactItem[][];
  chipRows: SignatureLink[][];
}

/**
 * Width of a line of text in a given style. Canvas has no text wrapping of
 * its own, so the layout has to measure. Injected so the geometry stays
 * pure: tests get the estimate, the export gets the real font.
 */
export type TextMeasure = (text: string, style: TypeStyle) => number;

/** Greedy word wrap. A single word wider than the limit keeps its own line. */
export function wrapText(
  text: string,
  maxWidth: number,
  measure: (line: string) => number,
): string[] {
  const lines: string[] = [];
  let current = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const candidate = current ? `${current} ${word}` : word;
    if (current && measure(candidate) > maxWidth) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/**
 * Same line count as wrapText, but evened out so a centred tagline doesn't
 * end on a lone word. Canvas counterpart of the HTML's `text-wrap:balance`.
 */
export function wrapBalanced(
  text: string,
  maxWidth: number,
  measure: (line: string) => number,
): string[] {
  const greedy = wrapText(text, maxWidth, measure);
  if (greedy.length < 2) return greedy;

  let low = 0;
  let high = maxWidth;
  for (let step = 0; step < 10; step += 1) {
    const middle = (low + high) / 2;
    if (wrapText(text, middle, measure).length <= greedy.length) high = middle;
    else low = middle;
  }
  return wrapText(text, high, measure);
}

/** Full image width: boxed includes the card's padding, bare hugs the content. */
export function signatureCanvasWidth(
  mode: BackdropMode = "boxed",
  brandWidth: number = BRAND_COLUMN_WIDTH,
): number {
  const padX = mode === "boxed" ? CARD_PADDING_X : 2;
  const margin = mode === "boxed" ? OUTER_MARGIN : 0;
  return (margin + padX) * 2 + brandWidth + COLUMN_GUTTER + DETAILS_COLUMN_WIDTH;
}

/** One captioned contact block: label line + its value lines. */
function contactItemHeight(item: ContactItem): number {
  return LABEL_LINE + LABEL_GAP + item.lines.length * CONTACT_LINE;
}

function fontFor(style: TypeStyle): string {
  return `${TYPE[style].weight} ${TYPE[style].size}px ${CANVAS_FONT}`;
}

/**
 * Canvas's "top" baseline sits at the top of the em box, while CSS centres
 * text inside its line-height. Without this offset every line in the PNG
 * rides high compared with the same line in the HTML.
 */
function textTop(y: number, style: TypeStyle): number {
  return y + (TYPE[style].line - TYPE[style].size) / 2;
}

/**
 * Pure geometry for the PNG. `logoAspect` is height/width of the loaded
 * logo; pass null when there is no image, so the brand column falls back
 * to the company wordmark at text height.
 */
export function computeSignatureLayout(
  data: SignatureData,
  logoAspect: number | null,
  mode: BackdropMode = "boxed",
  measure: TextMeasure = estimateTextWidth,
): SignatureLayout {
  // Bare mode has no card to pad, so the bitmap hugs the content with
  // only a hairline of breathing room for antialiasing.
  const padX = mode === "boxed" ? CARD_PADDING_X : 2;
  const padY = mode === "boxed" ? CARD_PADDING_Y : 2;
  const margin = mode === "boxed" ? OUTER_MARGIN : 0;
  const brandWidth = brandColumnWidth(logoAspect === null ? null : data.logoWidth);
  const width = signatureCanvasWidth(mode, brandWidth);
  const contacts = deriveContactItems(data);
  const links = parseLinks(data.links);

  const wrapValue = (item: ContactItem, maxWidth: number): ContactItem => ({
    ...item,
    lines: item.lines.flatMap((line) =>
      wrapText(line, maxWidth, (text) => measure(text, "value")),
    ),
  });
  const contactRows = layoutContactRows(contacts).map((row) =>
    row.map((item, column) =>
      wrapValue(item, row.length === 1 ? DETAILS_COLUMN_WIDTH : CONTACT_COLUMN_WIDTHS[column]),
    ),
  );
  const chipRows = layoutChipRows(links);

  const logoWidth = clampLogoWidth(data.logoWidth);
  const hasLogo = logoAspect !== null;
  const logoHeight = hasLogo
    ? Math.round(logoWidth * logoAspect)
    : Math.round(logoWidth * DEFAULT_LOGO_ASPECT);

  const hasCompany = data.company.trim().length > 0;
  const markHeight = hasLogo ? logoHeight : hasCompany ? FALLBACK_MARK_LINE : 0;
  const taglineLines = wrapBalanced(data.tagline.trim().toUpperCase(), brandWidth, (text) =>
    measure(text, "tagline"),
  );
  const hasTagline = taglineLines.length > 0;
  const hasRule = markHeight > 0 && hasTagline;
  const taglineHeight = hasTagline
    ? (hasRule ? RULE_BLOCK : TAGLINE_GAP) + taglineLines.length * TAGLINE_LINE
    : 0;
  const brandHeight = markHeight + taglineHeight;

  const nameLines = wrapText(data.fullName.trim(), DETAILS_COLUMN_WIDTH, (text) =>
    measure(text, "name"),
  );
  const roleLines = wrapText(data.role.trim().toUpperCase(), DETAILS_COLUMN_WIDTH, (text) =>
    measure(text, "role"),
  );

  let detailsHeight = nameLines.length * NAME_LINE;
  if (roleLines.length > 0) detailsHeight += ROLE_GAP + roleLines.length * ROLE_LINE;

  if (contactRows.length > 0) {
    const rowHeights = contactRows.map((row) => Math.max(...row.map(contactItemHeight)));
    detailsHeight +=
      (nameLines.length > 0 || roleLines.length > 0 ? CONTACT_GAP : 0) +
      rowHeights.reduce((sum, h) => sum + h, 0) +
      (rowHeights.length - 1) * CONTACT_ROW_GAP;
  }
  if (chipRows.length > 0) {
    detailsHeight +=
      CHIPS_GAP + chipRows.length * CHIP_HEIGHT + (chipRows.length - 1) * CHIP_ROW_GAP;
  }

  const contentHeight = Math.max(brandHeight, detailsHeight, mode === "boxed" ? 140 : 1);
  const cardHeight = contentHeight + padY * 2;
  const detailsX = margin + padX + brandWidth + COLUMN_GUTTER;

  return {
    width,
    height: cardHeight + margin * 2,
    cardX: margin,
    cardY: margin,
    cardWidth: width - margin * 2,
    cardHeight,
    brandCenterX: margin + padX + brandWidth / 2,
    // Exactly where the HTML puts it: one column gap past the brand
    // column. Half the gutter would be 1px off, since the gutter also
    // contains the divider itself.
    dividerX: margin + padX + brandWidth + METRICS.columnGap,
    detailsX,
    detailsWidth: DETAILS_COLUMN_WIDTH,
    contentTop: margin + padY,
    contentHeight,
    brandHeight,
    detailsHeight,
    logoWidth,
    logoHeight,
    contacts,
    links,
    nameLines,
    roleLines,
    taglineLines,
    contactRows,
    chipRows,
  };
}

/**
 * `ctx.letterSpacing` only landed recently and is still uneven across
 * engines, so tracked text is drawn glyph by glyph. Slower, but the
 * exported PNG then looks identical in every browser.
 */
function trackedWidth(ctx: CanvasRenderingContext2D, text: string, tracking: number): number {
  const glyphs = [...text];
  if (glyphs.length === 0) return 0;
  return glyphs.reduce((sum, g) => sum + ctx.measureText(g).width + tracking, 0) - tracking;
}

function drawTracked(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  tracking: number,
): void {
  let cursor = x;
  for (const glyph of text) {
    ctx.fillText(glyph, cursor, y);
    cursor += ctx.measureText(glyph).width + tracking;
  }
}

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function drawLabel(
  ctx: CanvasRenderingContext2D,
  palette: Palette,
  text: string,
  x: number,
  y: number,
): void {
  ctx.fillStyle = palette.label;
  ctx.font = fontFor("label");
  drawTracked(ctx, text.toUpperCase(), x, textTop(y, "label"), TYPE.label.tracking);
}

/** The coloured card: flat fill, then the two corner glows, clipped. */
function drawCard(
  ctx: CanvasRenderingContext2D,
  palette: Palette,
  layout: SignatureLayout,
): void {
  roundRectPath(ctx, layout.cardX, layout.cardY, layout.cardWidth, layout.cardHeight, CARD_RADIUS);
  ctx.fillStyle = palette.background;
  ctx.fill();

  ctx.save();
  roundRectPath(ctx, layout.cardX, layout.cardY, layout.cardWidth, layout.cardHeight, CARD_RADIUS);
  ctx.clip();

  const warmX = layout.cardX + layout.cardWidth * 0.06;
  const warmY = layout.cardY + layout.cardHeight * 0.18;
  const warm = ctx.createRadialGradient(warmX, warmY, 0, warmX, warmY, layout.cardWidth * 0.5);
  warm.addColorStop(0, palette.glowWarm);
  warm.addColorStop(1, palette.background);
  ctx.fillStyle = warm;
  ctx.fillRect(layout.cardX, layout.cardY, layout.cardWidth, layout.cardHeight);

  const coolX = layout.cardX + layout.cardWidth * 0.97;
  const coolY = layout.cardY + layout.cardHeight * 0.04;
  const cool = ctx.createRadialGradient(coolX, coolY, 0, coolX, coolY, layout.cardWidth * 0.4);
  cool.addColorStop(0, palette.glowCool);
  cool.addColorStop(1, palette.background);
  ctx.fillStyle = cool;
  ctx.fillRect(layout.cardX, layout.cardY, layout.cardWidth, layout.cardHeight);
  ctx.restore();
}

/**
 * The column rule, accent-tinted in the middle and fading out at both
 * ends. Boxed, it fades into the card. Bare, the ground is transparent,
 * so it fades to transparent instead of to a colour that isn't there.
 */
function drawDivider(
  ctx: CanvasRenderingContext2D,
  palette: Palette,
  layout: SignatureLayout,
  mode: BackdropMode,
): void {
  const inset = mode === "boxed" ? METRICS.cardPaddingY : 6;
  const top = layout.cardY + inset;
  const bottom = layout.cardY + layout.cardHeight - inset;
  if (bottom <= top) return;

  const ends = mode === "boxed" ? palette.background : "rgba(0,0,0,0)";
  const rule = ctx.createLinearGradient(0, top, 0, bottom);
  rule.addColorStop(0, ends);
  rule.addColorStop(0.32, palette.accentSoft);
  rule.addColorStop(0.68, palette.accentSoft);
  rule.addColorStop(1, ends);
  ctx.fillStyle = rule;
  ctx.fillRect(layout.dividerX, top, 2, bottom - top);
}

export function drawSignature(
  ctx: CanvasRenderingContext2D,
  data: SignatureData,
  palette: Palette,
  logo: CanvasImageSource | null,
  layout: SignatureLayout,
  mode: BackdropMode = "boxed",
): void {
  ctx.clearRect(0, 0, layout.width, layout.height);
  ctx.textBaseline = "top";
  ctx.textAlign = "left";

  // Bare mode paints no card and no glows — the fill, the rounding and
  // the gradients ARE the card. What is left is type, rule and chips on
  // a transparent ground.
  if (mode === "boxed") {
    drawCard(ctx, palette, layout);
  }

  drawDivider(ctx, palette, layout, mode);
  // ---- Brand column, centred against the taller of the two columns ----
  let brandY = layout.contentTop + (layout.contentHeight - layout.brandHeight) / 2;
  const company = data.company.trim();
  let hasMark = false;

  if (logo) {
    ctx.drawImage(
      logo,
      layout.brandCenterX - layout.logoWidth / 2,
      brandY,
      layout.logoWidth,
      layout.logoHeight,
    );
    brandY += layout.logoHeight;
    hasMark = true;
  } else if (company) {
    ctx.fillStyle = palette.text;
    ctx.font = fontFor("company");
    ctx.textAlign = "center";
    ctx.fillText(company, layout.brandCenterX, textTop(brandY, "company"));
    ctx.textAlign = "left";
    brandY += FALLBACK_MARK_LINE;
    hasMark = true;
  }

  if (layout.taglineLines.length > 0) {
    if (hasMark) {
      // Accent hairline between wordmark and tagline.
      ctx.fillStyle = palette.accent;
      ctx.fillRect(
        layout.brandCenterX - METRICS.ruleWidth / 2,
        brandY + METRICS.ruleGapAbove,
        METRICS.ruleWidth,
        2,
      );
      brandY += RULE_BLOCK;
    } else {
      brandY += TAGLINE_GAP;
    }
    ctx.fillStyle = palette.muted;
    ctx.font = fontFor("tagline");
    const track = TYPE.tagline.tracking;
    for (const line of layout.taglineLines) {
      const lineX = layout.brandCenterX - trackedWidth(ctx, line, track) / 2;
      drawTracked(ctx, line, lineX, textTop(brandY, "tagline"), track);
      brandY += TAGLINE_LINE;
    }
  }

  // ---- Details column ----
  let y = layout.contentTop + (layout.contentHeight - layout.detailsHeight) / 2;

  ctx.fillStyle = palette.text;
  ctx.font = fontFor("name");
  for (const line of layout.nameLines) {
    ctx.fillText(line, layout.detailsX, textTop(y, "name"));
    y += NAME_LINE;
  }

  if (layout.roleLines.length > 0) {
    y += ROLE_GAP;
    ctx.fillStyle = palette.accent;
    ctx.font = fontFor("role");
    for (const line of layout.roleLines) {
      drawTracked(ctx, line, layout.detailsX, textTop(y, "role"), TYPE.role.tracking);
      y += ROLE_LINE;
    }
  }

  if (layout.contactRows.length > 0) {
    if (layout.nameLines.length > 0 || layout.roleLines.length > 0) y += CONTACT_GAP;

    for (const row of layout.contactRows) {
      row.forEach((item, column) => {
        const columnX =
          layout.detailsX + (column === 0 ? 0 : CONTACT_COLUMN_WIDTHS[0] + METRICS.contactGridGap);
        drawLabel(ctx, palette, item.label, columnX, y);

        ctx.fillStyle = palette.text;
        ctx.font = fontFor("value");
        item.lines.forEach((line, lineIndex) => {
          const lineY = y + LABEL_LINE + LABEL_GAP + lineIndex * CONTACT_LINE;
          ctx.fillText(line, columnX, textTop(lineY, "value"));
        });
      });

      y += Math.max(...row.map(contactItemHeight)) + CONTACT_ROW_GAP;
    }
    y -= CONTACT_ROW_GAP;
  }

  if (layout.chipRows.length > 0) {
    y += CHIPS_GAP;
    ctx.font = fontFor("chip");
    const chipInset = METRICS.chipBorder + METRICS.chipPaddingX;
    const chipTextY = (CHIP_HEIGHT - TYPE.chip.size) / 2;

    for (const row of layout.chipRows) {
      let chipX = layout.detailsX;
      for (const link of row) {
        const width = chipWidth(ctx.measureText(link.label).width);

        // Inset by half a pixel so the 1px stroke lands on whole pixels.
        roundRectPath(ctx, chipX + 0.5, y + 0.5, width - 1, CHIP_HEIGHT - 1, CHIP_HEIGHT / 2);
        ctx.fillStyle = palette.surface;
        ctx.fill();
        ctx.strokeStyle = palette.surfaceBorder;
        ctx.lineWidth = METRICS.chipBorder;
        ctx.stroke();

        ctx.fillStyle = palette.accent;
        ctx.beginPath();
        ctx.arc(chipX + chipInset + 3, y + CHIP_HEIGHT / 2, 3, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = palette.text;
        ctx.fillText(link.label, chipX + chipInset + METRICS.chipDotSpace, y + chipTextY);

        chipX += width + METRICS.chipRowGap;
      }
      y += CHIP_HEIGHT + CHIP_ROW_GAP;
    }
  }
}

/**
 * Loads a logo for the canvas. Remote sources are requested with CORS so
 * the canvas stays untainted — without it `toBlob` throws a SecurityError
 * and the export dies at the last step instead of at load time.
 */
export function loadLogoImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image();
    if (!src.startsWith("data:")) image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

export async function renderSignatureBlob(
  data: SignatureData,
  palette: Palette,
  logo: HTMLImageElement | null,
  scale: number,
  transparent: boolean,
  mode: BackdropMode = "boxed",
): Promise<Blob> {
  const aspect = logo && logo.naturalWidth > 0 ? logo.naturalHeight / logo.naturalWidth : null;

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");

  const layout = computeSignatureLayout(data, aspect, mode, (text, style) => {
    ctx.font = fontFor(style);
    const { tracking } = TYPE[style];
    return tracking > 0 ? trackedWidth(ctx, text, tracking) : ctx.measureText(text).width;
  });

  // Resizing a canvas resets its context, so this has to precede scale().
  canvas.width = Math.round(layout.width * scale);
  canvas.height = Math.round(layout.height * scale);
  ctx.scale(scale, scale);

  // The corners outside the rounded card are transparent by default so the
  // PNG drops onto any email background. Opting out fills them with a tone
  // close to the card, for clients that composite transparency badly. Bare
  // mode must stay transparent, or it would paint back the very box the
  // mode exists to remove.
  if (!transparent && mode === "boxed") {
    ctx.fillStyle = mixHex(palette.background, palette.text, 0.02);
    ctx.fillRect(0, 0, layout.width, layout.height);
  }
  drawSignature(ctx, data, palette, logo, layout, mode);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Rendering the signature to PNG failed"));
    }, "image/png");
  });
}

export function triggerDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function buildPngFileName(fullName: string): string {
  const slug = fullName
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${slug || "email"}-signature.png`;
}
