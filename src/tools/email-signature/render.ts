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
  clampLogoWidth,
  deriveContactItems,
  METRICS,
  mixHex,
  parseLinks,
  SIGNATURE_WIDTH,
  TYPE,
  type ContactItem,
  type Palette,
  type SignatureData,
  type SignatureLink,
} from "./signature";

export { BRAND_COLUMN_WIDTH };

/**
 * The card is drawn at exactly the width the HTML renders at, not at an
 * arbitrary larger size. Resolution comes from the `scale` multiplier in
 * renderSignatureBlob instead. Drawing a wider canvas at the same font
 * sizes is what made every line except the name unreadable in the export.
 */
export const CANVAS_WIDTH = SIGNATURE_WIDTH + 24 * 2;
export const OUTER_MARGIN = 24;
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
}

/** One captioned contact block: label line + its value lines. */
function contactItemHeight(item: ContactItem): number {
  return LABEL_LINE + LABEL_GAP + item.lines.length * CONTACT_LINE;
}

function contactRowHeights(contacts: ContactItem[]): number[] {
  const heights: number[] = [];
  for (let index = 0; index < contacts.length; index += 2) {
    const pair = contacts.slice(index, index + 2);
    heights.push(Math.max(...pair.map(contactItemHeight)));
  }
  return heights;
}

function chipRowCount(links: SignatureLink[]): number {
  return Math.ceil(links.length / 3);
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
): SignatureLayout {
  // Bare mode has no card to pad, so the bitmap hugs the content with
  // only a hairline of breathing room for antialiasing.
  const padX = mode === "boxed" ? CARD_PADDING_X : 2;
  const padY = mode === "boxed" ? CARD_PADDING_Y : 2;
  const margin = mode === "boxed" ? OUTER_MARGIN : 0;
  const contacts = deriveContactItems(data);
  const links = parseLinks(data.links);

  const logoWidth = clampLogoWidth(data.logoWidth);
  const hasLogo = logoAspect !== null;
  const logoHeight = hasLogo
    ? Math.round(logoWidth * logoAspect)
    : Math.round(logoWidth * DEFAULT_LOGO_ASPECT);

  const hasCompany = data.company.trim().length > 0;
  const markHeight = hasLogo ? logoHeight : hasCompany ? FALLBACK_MARK_LINE : 0;
  const tagline = data.tagline.trim().length > 0;
  const hasRule = markHeight > 0 && tagline;
  const taglineHeight = tagline ? (hasRule ? RULE_BLOCK : TAGLINE_GAP) + TAGLINE_LINE : 0;
  const brandHeight = markHeight + taglineHeight;

  let detailsHeight = 0;
  const hasName = data.fullName.trim().length > 0;
  const hasRole = data.role.trim().length > 0;
  if (hasName) detailsHeight += NAME_LINE;
  if (hasRole) detailsHeight += ROLE_GAP + ROLE_LINE;

  const rowHeights = contactRowHeights(contacts);
  if (contacts.length > 0) {
    const gaps = (rowHeights.length - 1) * CONTACT_ROW_GAP;
    detailsHeight +=
      (hasName || hasRole ? CONTACT_GAP : 0) + rowHeights.reduce((sum, h) => sum + h, 0) + gaps;
  }
  if (links.length > 0) {
    detailsHeight +=
      CHIPS_GAP + chipRowCount(links) * CHIP_HEIGHT + (chipRowCount(links) - 1) * CHIP_ROW_GAP;
  }

  const contentHeight = Math.max(brandHeight, detailsHeight, mode === "boxed" ? 140 : 1);
  const cardHeight = contentHeight + padY * 2;
  const detailsX = margin + padX + BRAND_COLUMN_WIDTH + COLUMN_GUTTER;

  return {
    width: CANVAS_WIDTH,
    height: cardHeight + margin * 2,
    cardX: margin,
    cardY: margin,
    cardWidth: CANVAS_WIDTH - margin * 2,
    cardHeight,
    brandCenterX: margin + padX + BRAND_COLUMN_WIDTH / 2,
    // Exactly where the HTML puts it: one column gap past the brand
    // column. Half the gutter would be 1px off, since the gutter also
    // contains the divider itself.
    dividerX: margin + padX + BRAND_COLUMN_WIDTH + METRICS.columnGap,
    detailsX,
    detailsWidth: CANVAS_WIDTH - margin - padX - detailsX,
    contentTop: margin + padY,
    contentHeight,
    brandHeight,
    detailsHeight,
    logoWidth,
    logoHeight,
    contacts,
    links,
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
  ctx.font = `600 ${TYPE.label.size}px ${CANVAS_FONT}`;
  drawTracked(ctx, text.toUpperCase(), x, y, TYPE.label.tracking);
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
  const inset = mode === "boxed" ? 34 : 6;
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
  const tagline = data.tagline.trim();
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
    ctx.font = `700 ${TYPE.company.size}px ${CANVAS_FONT}`;
    ctx.textAlign = "center";
    ctx.fillText(company, layout.brandCenterX, brandY);
    ctx.textAlign = "left";
    brandY += FALLBACK_MARK_LINE;
    hasMark = true;
  }

  if (tagline) {
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
    ctx.font = `${TYPE.tagline.size}px ${CANVAS_FONT}`;
    const upper = tagline.toUpperCase();
    const track = TYPE.tagline.tracking;
    drawTracked(ctx, upper, layout.brandCenterX - trackedWidth(ctx, upper, track) / 2, brandY, track);
  }

  // ---- Details column ----
  let y = layout.contentTop + (layout.contentHeight - layout.detailsHeight) / 2;
  const name = data.fullName.trim();
  const role = data.role.trim();

  if (name) {
    ctx.fillStyle = palette.text;
    ctx.font = `700 ${TYPE.name.size}px ${CANVAS_FONT}`;
    ctx.fillText(name, layout.detailsX, y);
    y += NAME_LINE;
  }

  if (role) {
    y += ROLE_GAP;
    ctx.fillStyle = palette.accent;
    ctx.font = `600 ${TYPE.role.size}px ${CANVAS_FONT}`;
    drawTracked(ctx, role.toUpperCase(), layout.detailsX, y, TYPE.role.tracking);
    y += ROLE_LINE;
  }

  if (layout.contacts.length > 0) {
    if (name || role) y += CONTACT_GAP;
    const columnWidth = (layout.detailsWidth - METRICS.contactGridGap) / 2;

    for (let index = 0; index < layout.contacts.length; index += 2) {
      const pair = layout.contacts.slice(index, index + 2);

      pair.forEach((item, column) => {
        const columnX = layout.detailsX + column * (columnWidth + METRICS.contactGridGap);
        drawLabel(ctx, palette, item.label, columnX, y);

        ctx.fillStyle = palette.text;
        ctx.font = `${TYPE.value.size}px ${CANVAS_FONT}`;
        item.lines.forEach((line, lineIndex) => {
          ctx.fillText(line, columnX, y + LABEL_LINE + LABEL_GAP + lineIndex * CONTACT_LINE);
        });
      });

      y += Math.max(...pair.map(contactItemHeight)) + CONTACT_ROW_GAP;
    }
    y -= CONTACT_ROW_GAP;
  }

  if (layout.links.length > 0) {
    y += CHIPS_GAP;

    for (let index = 0; index < layout.links.length; index += 3) {
      let chipX = layout.detailsX;
      for (const link of layout.links.slice(index, index + 3)) {
        ctx.font = `${TYPE.chip.size}px ${CANVAS_FONT}`;
        const chipWidth = ctx.measureText(link.label).width + METRICS.chipPaddingX * 2 + 22;

        roundRectPath(ctx, chipX + 0.5, y + 0.5, chipWidth, CHIP_HEIGHT, CHIP_HEIGHT / 2);
        ctx.fillStyle = palette.surface;
        ctx.fill();
        ctx.strokeStyle = palette.surfaceBorder;
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.fillStyle = palette.accent;
        ctx.beginPath();
        ctx.arc(chipX + METRICS.chipPaddingX + 3, y + CHIP_HEIGHT / 2, 3.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = palette.text;
        ctx.fillText(link.label, chipX + METRICS.chipPaddingX + 15, y + CHIP_HEIGHT / 2 - TYPE.chip.size / 2 - 1);

        chipX += chipWidth + 10;
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
  const layout = computeSignatureLayout(data, aspect, mode);

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(layout.width * scale);
  canvas.height = Math.round(layout.height * scale);

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");

  ctx.scale(scale, scale);
  // The margin around the card is transparent by default so the PNG drops
  // onto any email background. Opting out fills it with a tone close to
  // the card, for clients that composite transparency badly. Bare mode
  // has no margin to fill and must stay transparent, or it would paint
  // back the very box the mode exists to remove.
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
