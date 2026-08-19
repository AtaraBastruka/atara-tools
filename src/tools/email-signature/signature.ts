/**
 * Pure model + HTML generation for the email signature builder.
 *
 * Free of DOM access so it can be unit tested, and so the same model
 * drives both exports: this module owns the pasteable HTML, ./render.ts
 * owns the canvas PNG.
 *
 * The HTML targets *email clients*, not browsers: nested presentational
 * tables and inline styles only, no flex, no grid, no <style> block.
 * Outlook on Windows renders through Word and supports none of those.
 *
 * Where a modern client can do better, this file layers enhancement on
 * top of a solid fallback rather than picking one or the other:
 *
 *   - `border-radius` is emitted anyway. Gmail/Apple Mail round the card
 *     and the chips; Word ignores it and renders them square.
 *   - `background-image` gradients always sit on top of a `background-color`
 *     that stands alone. Word drops the image and keeps the flat colour.
 *   - Every "translucent" tone is pre-flattened to a solid hex, because
 *     Word discards alpha entirely.
 *
 * That is why nothing here uses rgba().
 */

export interface SignatureData {
  fullName: string;
  role: string;
  company: string;
  tagline: string;
  /** Publicly reachable logo URL. Preferred over an uploaded file for HTML. */
  logoUrl: string;
  /** data: URL of a locally chosen logo. Required for the PNG export. */
  logoDataUrl: string | null;
  logoWidth: number;
  phone: string;
  email: string;
  address: string;
  /** One entry per line in the UI; each becomes a chip. */
  links: string;
}

export interface Palette {
  background: string;
  accent: string;
  text: string;
  /** Small uppercase field labels. */
  label: string;
  muted: string;
  divider: string;
  /** Chip / badge fill. */
  surface: string;
  surfaceBorder: string;
  /** Accent tint used for the divider's glow. */
  accentSoft: string;
  /** Two tones for the card's decorative corner glows. */
  glowWarm: string;
  glowCool: string;
}

export const DEFAULT_BACKGROUND = "#141a24";
export const DEFAULT_ACCENT = "#6ea8fe";

/**
 * Column widths in px. The signature comes out ~985px wide — wide for
 * email, but this is a desktop-first branded signature whose whole
 * character is the two-column split.
 */
export const BRAND_COLUMN_WIDTH = 280;
export const DETAILS_COLUMN_WIDTH = 560;
/**
 * `boxed` paints the coloured card. `bare` drops the card entirely and
 * lets the signature sit directly on the email body — no fill, no
 * rounding, no corner glows, no padding.
 *
 * The mode changes where contrast comes from. Boxed, the palette derives
 * against the card colour the user picked. Bare, there is no card, so it
 * derives against BARE_BACKDROPS — the body colour the signature will
 * land on. That colour is never painted; it exists only so text, chips
 * and the divider stay legible on the recipient's background.
 */
export type BackdropMode = "boxed" | "bare";

export const BARE_BACKDROPS: Record<"light" | "dark", string> = {
  light: "#ffffff",
  dark: "#111111",
};

export type BareSurface = keyof typeof BARE_BACKDROPS;

/**
 * The single type scale, shared by BOTH renderers.
 *
 * These lived twice — once as CSS strings here, once as magic numbers in
 * ./render.ts — and drifted: the PNG drew 14px body text onto a 1200px
 * canvas while the HTML drew the same 14px onto a 998px one, so every
 * line except the name came out ~20% smaller in the exported image.
 * Sizes are in px and mean the same thing in both outputs, which only
 * holds because METRICS below keeps the two canvases the same width.
 */
export const TYPE = {
  name: { size: 31, line: 37, tracking: -0.5 },
  role: { size: 13, line: 18, tracking: 2.4 },
  company: { size: 30, line: 36, tracking: -0.6 },
  tagline: { size: 11, line: 17, tracking: 2.6 },
  /** Small uppercase captions above each contact value. */
  label: { size: 11, line: 13, tracking: 1.6 },
  /** Phone / email / address — the lines people actually have to read. */
  value: { size: 15, line: 22 },
  chip: { size: 13, line: 16 },
} as const;

/** Card geometry, likewise shared so the two outputs stay the same size. */
export const METRICS = {
  cardPaddingX: 42,
  cardPaddingY: 34,
  cardRadius: 26,
  /** Gap between each column and the divider. */
  columnGap: 36,
  dividerWidth: 2,
  labelGap: 6,
  contactRowGap: 16,
  contactGridGap: 28,
  contactsGap: 22,
  chipsGap: 20,
  chipRowGap: 10,
  chipPaddingX: 16,
  chipPaddingY: 9,
  chipRadius: 18,
  roleGap: 8,
  ruleWidth: 40,
  ruleGapAbove: 16,
  ruleGapBelow: 14,
  taglineGap: 16,
} as const;

/**
 * Rendered width of the whole signature in px. The PNG derives its
 * canvas from this so both outputs are the same size and one type scale
 * reads identically in each.
 */
export const SIGNATURE_WIDTH =
  METRICS.cardPaddingX * 2 +
  BRAND_COLUMN_WIDTH +
  METRICS.columnGap * 2 +
  METRICS.dividerWidth +
  DETAILS_COLUMN_WIDTH;

export const MIN_LOGO_WIDTH = 80;
export const MAX_LOGO_WIDTH = 360;
export const DEFAULT_LOGO_WIDTH = 220;

/** A blank form. Every field is a placeholder in the UI, not a value. */
export const EMPTY_SIGNATURE: SignatureData = {
  fullName: "",
  role: "",
  company: "",
  tagline: "",
  logoUrl: "",
  logoDataUrl: null,
  logoWidth: DEFAULT_LOGO_WIDTH,
  phone: "",
  email: "",
  address: "",
  links: "",
};

/**
 * Shown as `placeholder` text on each input, and loaded wholesale by the
 * "Load example" button.
 *
 * Every value here is deliberately fictional: `example.com` and friends
 * are IANA-reserved for documentation, and 555-01xx is the reserved
 * fiction range for US phone numbers. Never put a real person, company,
 * address, or domain in here — placeholder copy gets copied.
 */
export const EXAMPLE_SIGNATURE: SignatureData = {
  fullName: "Alex Rivera",
  role: "Product Designer",
  company: "Northwind",
  tagline: "Design & Engineering Studio",
  logoUrl: "",
  logoDataUrl: null,
  logoWidth: DEFAULT_LOGO_WIDTH,
  phone: "+1 555 0142",
  email: "alex@example.com",
  address: "1200 Market Street, Suite 400\nSan Francisco, CA 94102",
  links: "example.com\nexample.org\nexample.net",
};

/**
 * Resolves to SF Pro on Apple Mail and iOS, Segoe UI in Outlook on
 * Windows, Roboto on Android — the native UI face on every platform
 * instead of Arial everywhere. Each name is a real installed font, so
 * nothing is downloaded: webfonts do not work in email.
 */
export const FONT_STACK =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Helvetica, Arial, sans-serif";

/** True when the form is blank and there is nothing to render. */
export function isBlank(data: SignatureData): boolean {
  return (
    !data.fullName.trim() &&
    !data.role.trim() &&
    !data.company.trim() &&
    !data.tagline.trim() &&
    !data.phone.trim() &&
    !data.email.trim() &&
    !data.address.trim() &&
    !data.links.trim() &&
    !data.logoUrl.trim() &&
    !data.logoDataUrl
  );
}

const HEX_PATTERN = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

/**
 * Returns a canonical `#rrggbb` string, or null when the input is not a
 * hex colour. Every colour reaching a `style` attribute goes through this
 * first — an unvalidated string there would let arbitrary CSS into the
 * generated markup.
 */
export function normalizeHex(value: string): string | null {
  const match = HEX_PATTERN.exec(value.trim());
  if (!match) return null;

  const digits = match[1].toLowerCase();
  const expanded =
    digits.length === 3
      ? digits
          .split("")
          .map((digit) => digit + digit)
          .join("")
      : digits;

  return `#${expanded}`;
}

function toChannels(hex: string): [number, number, number] {
  const normalized = normalizeHex(hex) ?? "#000000";
  return [
    parseInt(normalized.slice(1, 3), 16),
    parseInt(normalized.slice(3, 5), 16),
    parseInt(normalized.slice(5, 7), 16),
  ];
}

function toHex(channels: [number, number, number]): string {
  return `#${channels
    .map((channel) => Math.max(0, Math.min(255, Math.round(channel))).toString(16).padStart(2, "0"))
    .join("")}`;
}

/** Blends `from` toward `to` by `weight` (0 = `from`, 1 = `to`). */
export function mixHex(from: string, to: string, weight: number): string {
  const clamped = Math.max(0, Math.min(1, weight));
  const a = toChannels(from);
  const b = toChannels(to);
  return toHex([
    a[0] + (b[0] - a[0]) * clamped,
    a[1] + (b[1] - a[1]) * clamped,
    a[2] + (b[2] - a[2]) * clamped,
  ]);
}

/** WCAG relative luminance, used only to pick a readable text colour. */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = toChannels(hex).map((channel) => {
    const srgb = channel / 255;
    return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function readableTextColor(background: string): string {
  return relativeLuminance(background) > 0.42 ? "#101010" : "#ffffff";
}

/**
 * The user supplies two colours; every other tone is derived from them,
 * so changing the background can never leave unreadable text, an
 * invisible divider, or a chip that vanishes into the card.
 */
export function derivePalette(background: string, accent: string): Palette {
  const bg = normalizeHex(background) ?? DEFAULT_BACKGROUND;
  const ac = normalizeHex(accent) ?? DEFAULT_ACCENT;
  const text = readableTextColor(bg);

  return {
    background: bg,
    accent: ac,
    text,
    label: mixHex(bg, text, 0.5),
    muted: mixHex(bg, text, 0.62),
    divider: mixHex(bg, text, 0.16),
    surface: mixHex(bg, text, 0.09),
    surfaceBorder: mixHex(bg, text, 0.17),
    accentSoft: mixHex(bg, ac, 0.55),
    glowWarm: mixHex(bg, ac, 0.14),
    glowCool: mixHex(bg, text, 0.06),
  };
}

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => HTML_ESCAPES[character]);
}

/**
 * Accepts what people actually type ("example.com", "www.example.net") and
 * returns an absolute https URL. Anything with a non-http(s) scheme —
 * `javascript:` above all — returns null and is dropped rather than
 * emitted as a dead or dangerous href.
 */
export function normalizeLinkHref(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return null;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  if (!parsed.hostname.includes(".")) return null;

  return parsed.href;
}

/** Strips the scheme and any trailing slash so the chip reads like a brand. */
export function linkLabel(raw: string): string {
  return raw
    .trim()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//i, "")
    .replace(/\/+$/, "");
}

export interface SignatureLink {
  label: string;
  href: string;
}

export function parseLinks(raw: string): SignatureLink[] {
  return raw
    .split(/[\n,]/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => ({ label: linkLabel(entry), href: normalizeLinkHref(entry) }))
    .filter((link): link is SignatureLink => link.href !== null && link.label.length > 0);
}

export interface ContactItem {
  /** Small uppercase caption. Replaces the icon a mail client can't render. */
  label: string;
  lines: string[];
  href: string | null;
}

/**
 * Phone, email and address as one ordered list, so both renderers lay
 * them out with the same rhythm. Empty fields produce no item, so the
 * grid closes up on its own.
 *
 * Each item is captioned rather than given an icon: SVG does not render
 * in email, `data:` images are stripped by Gmail, and icon fonts fail
 * silently. A typeset label is the version that works everywhere and
 * still looks deliberate.
 */
export function deriveContactItems(data: SignatureData): ContactItem[] {
  const items: ContactItem[] = [];
  const phone = data.phone.trim();
  const email = data.email.trim();

  if (phone) {
    items.push({ label: "Phone", lines: [phone], href: `tel:${phone.replace(/[^\d+]/g, "")}` });
  }
  if (email) {
    items.push({ label: "Email", lines: [email], href: `mailto:${email}` });
  }

  const addressLines = data.address
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (addressLines.length > 0) {
    items.push({ label: "Address", lines: addressLines, href: null });
  }

  return items;
}

/** http(s) is fine anywhere; data: images work outside Gmail (see the UI note). */
export function isSafeImageSrc(value: string): boolean {
  return (
    /^https?:\/\/\S+$/i.test(value.trim()) ||
    /^data:image\/[a-z0-9.+-]+;base64,/i.test(value.trim())
  );
}

/**
 * Hosted URL wins over the uploaded file: Gmail strips `data:` image
 * sources outright, so a signature carrying only an inline logo loses it
 * for a large share of recipients.
 */
export function resolveLogoSrc(data: SignatureData): string | null {
  const hosted = data.logoUrl.trim();
  if (hosted && isSafeImageSrc(hosted)) return hosted;
  if (data.logoDataUrl && isSafeImageSrc(data.logoDataUrl)) return data.logoDataUrl;
  return null;
}

export function clampLogoWidth(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_LOGO_WIDTH;
  return Math.max(MIN_LOGO_WIDTH, Math.min(MAX_LOGO_WIDTH, Math.round(value)));
}

const TABLE_OPEN =
  '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">';

/**
 * `border-collapse:collapse` makes browsers drop `border-radius` on any
 * cell that also has a border — which is exactly what a chip is. Chips
 * therefore get their own separated table so they stay pill-shaped.
 */
const CHIP_TABLE_OPEN =
  '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;border-spacing:0;">';

const CONTACT_GRID_GAP = METRICS.contactGridGap;
/** Narrower left column: phone/email are short, addresses need the room. */
const CONTACT_COLUMN_WIDTHS = [
  248,
  DETAILS_COLUMN_WIDTH - 248 - CONTACT_GRID_GAP,
] as const;

function fieldLabel(text: string, palette: Palette): string {
  const { size, line, tracking } = TYPE.label;
  return `<div style="font-family:${FONT_STACK};font-size:${size}px;line-height:${line}px;letter-spacing:${tracking}px;text-transform:uppercase;color:${palette.label};padding-bottom:${METRICS.labelGap}px;">${escapeHtml(text.toUpperCase())}</div>`;
}

function contactCell(item: ContactItem, palette: Palette): string {
  const body = item.lines.map(escapeHtml).join("<br />");
  const text = item.href
    ? `<a href="${escapeHtml(item.href)}" style="color:${palette.text};text-decoration:none;">${body}</a>`
    : body;
  // A phone number broken across two lines reads as two numbers, so it
  // never wraps. Addresses are expected to wrap and deliberately don't
  // get this — pinning a long street line would force the card wider.
  const nowrap = item.href?.startsWith("tel:") ? "white-space:nowrap;" : "";

  return [
    fieldLabel(item.label, palette),
    `<div style="font-family:${FONT_STACK};font-size:${TYPE.value.size}px;line-height:${TYPE.value.line}px;color:${palette.text};${nowrap}">${text}</div>`,
  ].join("");
}

function contactGrid(items: ContactItem[], palette: Palette, hasChipsBelow: boolean): string {
  if (items.length === 0) return "";

  const rows: string[] = [];
  for (let index = 0; index < items.length; index += 2) {
    const pair = items.slice(index, index + 2);
    // Trailing padding on the last row sits inside the vertically centred
    // cell and would push the whole block visibly off-centre.
    const below = index + 2 >= items.length && !hasChipsBelow ? 0 : METRICS.contactRowGap;
    // Each column is pinned to a width. Left to auto-size, a long address
    // line grows its cell until the signature is wider than the card
    // meant to contain it.
    if (pair.length === 1) {
      // Alone on its row, an item gets the whole width rather than the
      // narrow left column with dead space beside it — which is what made
      // a one-line address wrap to three.
      rows.push(
        `<tr><td colspan="2" width="${DETAILS_COLUMN_WIDTH}" valign="top" style="width:${DETAILS_COLUMN_WIDTH}px;padding:0 0 ${below}px 0;">${contactCell(pair[0], palette)}</td></tr>`,
      );
      continue;
    }

    const cells = pair.map((item, column) => {
      const width = CONTACT_COLUMN_WIDTHS[column];
      const gap = column === 0 ? CONTACT_GRID_GAP : 0;
      return `<td width="${width}" valign="top" style="width:${width}px;padding:0 ${gap}px ${below}px 0;">${contactCell(item, palette)}</td>`;
    });
    rows.push(`<tr>${cells.join("")}</tr>`);
  }

  return `${TABLE_OPEN}${rows.join("")}</table>`;
}

function linkChip(link: SignatureLink, palette: Palette): string {
  return [
    CHIP_TABLE_OPEN,
    "<tr>",
    // The 1px border keeps the chip legible even where the fill is nearly
    // the card colour, e.g. a very light background.
    `<td style="background-color:${palette.surface};border:1px solid ${palette.surfaceBorder};border-radius:${METRICS.chipRadius}px;padding:${METRICS.chipPaddingY}px ${METRICS.chipPaddingX}px;font-family:${FONT_STACK};font-size:${TYPE.chip.size}px;line-height:${TYPE.chip.line}px;color:${palette.text};white-space:nowrap;">`,
    `<span style="color:${palette.accent};font-size:${TYPE.chip.size - 2}px;">&#9679;</span>&nbsp;`,
    `<a href="${escapeHtml(link.href)}" style="color:${palette.text};text-decoration:none;">${escapeHtml(link.label)}</a>`,
    "</td>",
    "</tr>",
    "</table>",
  ].join("");
}

/**
 * Chips are chunked into rows of three rather than left to wrap: a table
 * row is the only layout primitive that wraps predictably in Word, which
 * has no concept of flex-wrap.
 */
function linkChips(links: SignatureLink[], palette: Palette): string {
  if (links.length === 0) return "";

  const rows: string[] = [];
  for (let index = 0; index < links.length; index += 3) {
    const below = index + 3 >= links.length ? 0 : METRICS.chipRowGap;
    const cells = links
      .slice(index, index + 3)
      .map((link) => `<td style="padding:0 ${METRICS.chipRowGap}px ${below}px 0;">${linkChip(link, palette)}</td>`);
    rows.push(`<tr>${cells.join("")}</tr>`);
  }

  return `<div style="padding-top:${METRICS.chipsGap}px;">${TABLE_OPEN}${rows.join("")}</table></div>`;
}

function brandColumn(data: SignatureData, palette: Palette): string {
  const logoSrc = resolveLogoSrc(data);
  const width = clampLogoWidth(data.logoWidth);
  const company = data.company.trim();
  const tagline = data.tagline.trim();

  const mark = logoSrc
    ? `<img src="${escapeHtml(logoSrc)}" alt="${escapeHtml(company || "Logo")}" width="${width}" style="display:block;border:0;outline:none;text-decoration:none;width:${width}px;max-width:100%;height:auto;" />`
    : company
      ? `<div style="font-family:${FONT_STACK};font-size:${TYPE.company.size}px;line-height:${TYPE.company.line}px;font-weight:700;letter-spacing:${TYPE.company.tracking}px;color:${palette.text};">${escapeHtml(company)}</div>`
      : "";

  // A hairline under the wordmark, tinted toward the accent. Gives the
  // column a baseline to sit on when there is no logo artwork to anchor it.
  const rule =
    mark && tagline
      ? `<div style="padding:${METRICS.ruleGapAbove}px 0 ${METRICS.ruleGapBelow}px 0;">${TABLE_OPEN}<tr><td width="${METRICS.ruleWidth}" height="2" style="width:${METRICS.ruleWidth}px;height:2px;background-color:${palette.accent};font-size:1px;line-height:1px;">&nbsp;</td></tr></table></div>`
      : "";

  const taglineBlock = tagline
    ? `<div style="font-family:${FONT_STACK};font-size:${TYPE.tagline.size}px;line-height:${TYPE.tagline.line}px;letter-spacing:${TYPE.tagline.tracking}px;text-transform:uppercase;color:${palette.muted};${rule ? "" : `padding-top:${METRICS.taglineGap}px;`}">${escapeHtml(tagline.toUpperCase())}</div>`
    : "";

  return `${mark}${rule}${taglineBlock}`;
}

function detailsColumn(data: SignatureData, palette: Palette): string {
  const name = data.fullName.trim();
  const role = data.role.trim();

  const nameBlock = name
    ? `<div style="font-family:${FONT_STACK};font-size:${TYPE.name.size}px;line-height:${TYPE.name.line}px;font-weight:700;letter-spacing:${TYPE.name.tracking}px;color:${palette.text};">${escapeHtml(name)}</div>`
    : "";
  const roleBlock = role
    ? `<div style="font-family:${FONT_STACK};font-size:${TYPE.role.size}px;line-height:${TYPE.role.line}px;letter-spacing:${TYPE.role.tracking}px;text-transform:uppercase;font-weight:600;color:${palette.accent};padding-top:${METRICS.roleGap}px;">${escapeHtml(role.toUpperCase())}</div>`
    : "";

  const links = parseLinks(data.links);
  const contacts = contactGrid(deriveContactItems(data), palette, links.length > 0);
  const contactsBlock = contacts
    ? `<div style="padding-top:${nameBlock || roleBlock ? METRICS.contactsGap : 0}px;">${contacts}</div>`
    : "";

  return `${nameBlock}${roleBlock}${contactsBlock}${linkChips(links, palette)}`;
}

/**
 * A 2px rule that fades in and out along its length, tinted toward the
 * accent in the middle. The gradient is the enhancement; the flat
 * `background-color` underneath is what Word (and anything else that
 * drops background images) renders instead.
 */
function dividerCell(palette: Palette): string {
  // Fades to palette.background at both ends. In bare mode that is the
  // assumed body colour, so the rule still vanishes into its surroundings
  // instead of stopping dead against nothing.
  const gradient = `linear-gradient(to bottom, ${palette.background} 0%, ${palette.accentSoft} 32%, ${palette.accentSoft} 68%, ${palette.background} 100%)`;
  return `<td width="${METRICS.dividerWidth}" style="width:${METRICS.dividerWidth}px;background-color:${palette.divider};background-image:${gradient};font-size:1px;line-height:1px;">&nbsp;</td>`;
}

/**
 * Two soft corner glows, echoing the depth of the reference artwork.
 * Painted as background-images over the flat card colour, so a client
 * that drops them simply shows the flat colour — never a broken fill.
 */
function cardBackground(palette: Palette): string {
  const glows = [
    `radial-gradient(circle at 6% 18%, ${palette.glowWarm} 0%, ${palette.background} 58%)`,
    `radial-gradient(circle at 97% 4%, ${palette.glowCool} 0%, ${palette.background} 46%)`,
  ].join(",");
  return `background-color:${palette.background};background-image:${glows};`;
}

/**
 * The full pasteable signature. This exact string is what the preview
 * renders and what "Copy signature" puts on the clipboard — there is no
 * second, prettier code path for the preview.
 */
export function buildSignatureHtml(
  data: SignatureData,
  palette: Palette,
  mode: BackdropMode = "boxed",
): string {
  // Bare mode paints nothing and reserves no padding: the signature has
  // to sit flush against whatever the mail client puts behind it, the
  // same way a plain text signature would.
  const shell =
    mode === "boxed"
      ? `${cardBackground(palette)}border-radius:${METRICS.cardRadius}px;padding:${METRICS.cardPaddingY}px ${METRICS.cardPaddingX}px;`
      : "padding:0;";

  return [
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;font-family:${FONT_STACK};">`,
    "<tr>",
    `<td style="${shell}">`,
    TABLE_OPEN,
    "<tr>",
    // Both columns carry an explicit width. Without one, mail clients
    // (and the preview container) collapse the table to whatever space
    // happens to be available, which squeezes the contact grid.
    `<td width="${BRAND_COLUMN_WIDTH}" valign="middle" align="center" style="width:${BRAND_COLUMN_WIDTH}px;padding-right:${METRICS.columnGap}px;">${brandColumn(data, palette)}</td>`,
    dividerCell(palette),
    `<td width="${DETAILS_COLUMN_WIDTH}" valign="middle" style="width:${DETAILS_COLUMN_WIDTH}px;padding-left:${METRICS.columnGap}px;">${detailsColumn(data, palette)}</td>`,
    "</tr>",
    "</table>",
    "</td>",
    "</tr>",
    "</table>",
  ].join("");
}
