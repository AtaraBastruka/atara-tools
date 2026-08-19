import { describe, expect, it } from "vitest";
import {
  BARE_BACKDROPS,
  buildSignatureHtml,
  clampLogoWidth,
  DEFAULT_ACCENT,
  DEFAULT_BACKGROUND,
  DEFAULT_LOGO_WIDTH,
  deriveContactItems,
  derivePalette,
  DETAILS_COLUMN_WIDTH,
  EMPTY_SIGNATURE,
  EXAMPLE_SIGNATURE,
  escapeHtml,
  isBlank,
  isSafeImageSrc,
  linkLabel,
  mixHex,
  normalizeHex,
  normalizeLinkHref,
  parseLinks,
  readableTextColor,
  resolveLogoSrc,
  type SignatureData,
} from "../signature";

function withData(overrides: Partial<SignatureData>): SignatureData {
  return { ...EXAMPLE_SIGNATURE, ...overrides };
}

describe("normalizeHex", () => {
  it("canonicalises long, short, prefixed and uppercase forms", () => {
    expect(normalizeHex("#22C97E")).toBe("#22c97e");
    expect(normalizeHex("22c97e")).toBe("#22c97e");
    expect(normalizeHex("#0f8")).toBe("#00ff88");
    expect(normalizeHex("  #052e2a  ")).toBe("#052e2a");
  });

  it("rejects anything that is not a hex colour", () => {
    // These reach a style attribute if they get through — the CSS
    // injection guard for the generated markup lives right here.
    expect(normalizeHex("red")).toBeNull();
    expect(normalizeHex("#12345")).toBeNull();
    expect(normalizeHex("red;background:url(x)")).toBeNull();
    expect(normalizeHex("")).toBeNull();
  });
});

describe("mixHex", () => {
  it("returns the endpoints at weight 0 and 1", () => {
    expect(mixHex("#000000", "#ffffff", 0)).toBe("#000000");
    expect(mixHex("#000000", "#ffffff", 1)).toBe("#ffffff");
  });

  it("blends halfway and clamps out-of-range weights", () => {
    expect(mixHex("#000000", "#ffffff", 0.5)).toBe("#808080");
    expect(mixHex("#000000", "#ffffff", -3)).toBe("#000000");
    expect(mixHex("#000000", "#ffffff", 3)).toBe("#ffffff");
  });
});

describe("readableTextColor", () => {
  it("picks light text on dark backgrounds and dark text on light ones", () => {
    expect(readableTextColor("#052e2a")).toBe("#ffffff");
    expect(readableTextColor("#000000")).toBe("#ffffff");
    expect(readableTextColor("#ffffff")).toBe("#101010");
    expect(readableTextColor("#f4f4f5")).toBe("#101010");
  });
});

describe("derivePalette", () => {
  it("derives every supporting tone from the two user colours", () => {
    const palette = derivePalette(DEFAULT_BACKGROUND, DEFAULT_ACCENT);

    expect(palette.background).toBe(DEFAULT_BACKGROUND);
    expect(palette.accent).toBe(DEFAULT_ACCENT);
    expect(palette.text).toBe("#ffffff");
    // No rgba() anywhere: Word drops alpha, so each tone is pre-flattened.
    for (const tone of Object.values(palette)) {
      expect(tone).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("flips text to dark when the background is light", () => {
    expect(derivePalette("#ffffff", DEFAULT_ACCENT).text).toBe("#101010");
  });

  it("falls back to the defaults for invalid input rather than emitting junk", () => {
    const palette = derivePalette("not-a-colour", "also-not");
    expect(palette.background).toBe(DEFAULT_BACKGROUND);
    expect(palette.accent).toBe(DEFAULT_ACCENT);
  });
});

describe("escapeHtml", () => {
  it("escapes every character that could break out of text or an attribute", () => {
    expect(escapeHtml('<script>alert("x") & \'y\'</script>')).toBe(
      "&lt;script&gt;alert(&quot;x&quot;) &amp; &#39;y&#39;&lt;/script&gt;",
    );
  });
});

describe("normalizeLinkHref", () => {
  it("promotes bare hostnames to https", () => {
    expect(normalizeLinkHref("example.com")).toBe("https://example.com/");
    expect(normalizeLinkHref("www.example.net")).toBe("https://www.example.net/");
  });

  it("keeps an explicit http(s) URL and its path", () => {
    expect(normalizeLinkHref("https://example.org/team")).toBe("https://example.org/team");
    expect(normalizeLinkHref("http://example.com")).toBe("http://example.com/");
  });

  it("drops non-http schemes and unusable values", () => {
    expect(normalizeLinkHref("javascript:alert(1)")).toBeNull();
    expect(normalizeLinkHref("data:text/html,<script>")).toBeNull();
    expect(normalizeLinkHref("mailto:a@b.com")).toBeNull();
    expect(normalizeLinkHref("localhost")).toBeNull();
    expect(normalizeLinkHref("   ")).toBeNull();
  });
});

describe("linkLabel and parseLinks", () => {
  it("strips the scheme and trailing slash for display", () => {
    expect(linkLabel("https://example.com/")).toBe("example.com");
    expect(linkLabel("example.net")).toBe("example.net");
  });

  it("splits on newlines and commas, dropping unusable entries", () => {
    const links = parseLinks("example.com\nexample.org, example.net\n\njavascript:alert(1)\n");

    expect(links.map((link) => link.label)).toEqual([
      "example.com",
      "example.org",
      "example.net",
    ]);
    expect(links.every((link) => link.href.startsWith("https://"))).toBe(true);
  });
});

describe("deriveContactItems", () => {
  it("orders phone, email, then the address lines, each with a caption", () => {
    const items = deriveContactItems(
      withData({ phone: "+1 555 0142", email: "alex@example.com", address: "Line 1\nLine 2" }),
    );

    expect(items).toHaveLength(3);
    expect(items.map((item) => item.label)).toEqual(["Phone", "Email", "Address"]);
    expect(items[0].href).toBe("tel:+15550142");
    expect(items[1].href).toBe("mailto:alex@example.com");
    expect(items[2]).toEqual({ label: "Address", lines: ["Line 1", "Line 2"], href: null });
  });

  it("produces no item for an empty field, so the grid closes up", () => {
    expect(deriveContactItems(withData({ phone: "", email: "", address: "  \n " }))).toEqual([]);
  });
});

describe("logo source resolution", () => {
  it("prefers a hosted URL over the inline data URL (Gmail strips data: images)", () => {
    const src = resolveLogoSrc(
      withData({ logoUrl: "https://cdn.example.com/logo.png", logoDataUrl: "data:image/png;base64,AAAA" }),
    );
    expect(src).toBe("https://cdn.example.com/logo.png");
  });

  it("falls back to the uploaded file, then to nothing", () => {
    expect(resolveLogoSrc(withData({ logoUrl: "", logoDataUrl: "data:image/png;base64,AAAA" }))).toBe(
      "data:image/png;base64,AAAA",
    );
    expect(resolveLogoSrc(withData({ logoUrl: "", logoDataUrl: null }))).toBeNull();
  });

  it("ignores a hosted value that is not a safe image source", () => {
    expect(
      resolveLogoSrc(withData({ logoUrl: "javascript:alert(1)", logoDataUrl: null })),
    ).toBeNull();
    expect(isSafeImageSrc("data:text/html;base64,AAAA")).toBe(false);
  });
});

describe("clampLogoWidth", () => {
  it("clamps to the supported range and survives NaN", () => {
    expect(clampLogoWidth(10)).toBe(80);
    expect(clampLogoWidth(9999)).toBe(360);
    expect(clampLogoWidth(240)).toBe(240);
    expect(clampLogoWidth(Number.NaN)).toBe(DEFAULT_LOGO_WIDTH);
  });
});

describe("backdrop modes", () => {
  const palette = derivePalette(DEFAULT_BACKGROUND, DEFAULT_ACCENT);

  it("paints a rounded, padded, gradient card in boxed mode", () => {
    const html = buildSignatureHtml(EXAMPLE_SIGNATURE, palette, "boxed");

    expect(html).toContain("border-radius:26px");
    expect(html).toContain("padding:34px 42px");
    expect(html).toContain(`background-color:${DEFAULT_BACKGROUND}`);
    expect(html).toContain("radial-gradient");
  });

  it("paints nothing at all in bare mode — no fill, rounding, padding or glow", () => {
    const html = buildSignatureHtml(EXAMPLE_SIGNATURE, palette, "bare");

    expect(html).toContain("<td style=\"padding:0;\">");
    expect(html).not.toContain("border-radius:26px");
    expect(html).not.toContain("padding:34px 42px");
    expect(html).not.toContain("radial-gradient");
  });

  it("defaults to boxed, so an omitted mode never silently drops the card", () => {
    expect(buildSignatureHtml(EXAMPLE_SIGNATURE, palette)).toBe(
      buildSignatureHtml(EXAMPLE_SIGNATURE, palette, "boxed"),
    );
  });

  it("keeps the content identical between modes — only the shell changes", () => {
    const boxed = buildSignatureHtml(EXAMPLE_SIGNATURE, palette, "boxed");
    const bare = buildSignatureHtml(EXAMPLE_SIGNATURE, palette, "bare");

    for (const fragment of [
      "Alex Rivera",
      "PRODUCT DESIGNER",
      "1200 Market Street, Suite 400",
      'href="https://example.com/"',
      'href="tel:+15550142"',
    ]) {
      expect(boxed).toContain(fragment);
      expect(bare).toContain(fragment);
    }
    // The divider survives: it is structure, not decoration.
    expect(bare).toContain("linear-gradient(to bottom");
  });

  it("derives readable text from the backdrop the bare signature will sit on", () => {
    const onLight = derivePalette(BARE_BACKDROPS.light, DEFAULT_ACCENT);
    const onDark = derivePalette(BARE_BACKDROPS.dark, DEFAULT_ACCENT);

    expect(onLight.text).toBe("#101010");
    expect(onDark.text).toBe("#ffffff");
    // That backdrop is never painted — it only drives contrast.
    expect(buildSignatureHtml(EXAMPLE_SIGNATURE, onLight, "bare")).not.toContain(
      `background-color:${BARE_BACKDROPS.light}`,
    );
  });
});

describe("EMPTY_SIGNATURE and isBlank", () => {
  it("starts blank so every field can be a real placeholder", () => {
    expect(isBlank(EMPTY_SIGNATURE)).toBe(true);
    expect(isBlank(EXAMPLE_SIGNATURE)).toBe(false);
  });

  it("stops being blank as soon as any single field is filled", () => {
    const fields: (keyof typeof EMPTY_SIGNATURE)[] = [
      "fullName",
      "role",
      "company",
      "tagline",
      "phone",
      "email",
      "address",
      "links",
      "logoUrl",
    ];
    for (const field of fields) {
      expect(isBlank({ ...EMPTY_SIGNATURE, [field]: "x" })).toBe(false);
    }
    expect(isBlank({ ...EMPTY_SIGNATURE, logoDataUrl: "data:image/png;base64,AA" })).toBe(false);
  });

  it("treats whitespace-only input as still blank", () => {
    expect(isBlank({ ...EMPTY_SIGNATURE, fullName: "   ", address: "\n \n" })).toBe(true);
  });
});

describe("buildSignatureHtml", () => {
  const palette = derivePalette(DEFAULT_BACKGROUND, DEFAULT_ACCENT);

  it("emits only table-based layout with inline styles", () => {
    const html = buildSignatureHtml(EXAMPLE_SIGNATURE, palette);

    expect(html.startsWith("<table")).toBe(true);
    // Word (Outlook on Windows) supports none of these.
    expect(html).not.toMatch(/display\s*:\s*flex/);
    expect(html).not.toMatch(/display\s*:\s*grid/);
    // Word discards alpha outright, so no tone may depend on it.
    expect(html).not.toMatch(/rgba\(/);
    // No <style> block either — Gmail strips them from pasted signatures.
    expect(html).not.toMatch(/<style/i);
  });

  it("never paints a gradient without a solid colour underneath it", () => {
    const html = buildSignatureHtml(EXAMPLE_SIGNATURE, palette);
    const styles = [...html.matchAll(/style="([^"]*)"/g)].map((match) => match[1]);
    const gradientStyles = styles.filter((style) => style.includes("background-image:"));

    // The gradients are the whole reason the card has depth, so this is
    // not a "no gradients" rule — it is the fallback contract. Word drops
    // background-image and would render an unpainted cell without this.
    expect(gradientStyles.length).toBeGreaterThan(0);
    for (const style of gradientStyles) {
      expect(style).toMatch(/background-color:#[0-9a-f]{6}/);
    }
  });

  it("asks for the native UI font on every platform, and downloads nothing", () => {
    const html = buildSignatureHtml(EXAMPLE_SIGNATURE, palette);

    expect(html).toContain("-apple-system");
    expect(html).toContain("Segoe UI");
    expect(html).toContain("Arial, sans-serif");
    // Webfonts do not load in email; @import/@font-face would be dead weight.
    expect(html).not.toMatch(/@import|@font-face|fonts\.googleapis/i);
  });

  it("marks every layout table as presentational for screen readers", () => {
    const html = buildSignatureHtml(EXAMPLE_SIGNATURE, palette);
    const tableCount = (html.match(/<table/g) ?? []).length;
    const presentationCount = (html.match(/role="presentation"/g) ?? []).length;

    expect(tableCount).toBeGreaterThan(1);
    expect(presentationCount).toBe(tableCount);
  });

  it("escapes user text instead of letting it become markup", () => {
    const html = buildSignatureHtml(
      withData({ fullName: '<img src=x onerror="alert(1)">' }),
      palette,
    );

    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
  });

  it("uppercases the role and tagline the way the layout expects", () => {
    const html = buildSignatureHtml(withData({ role: "Product Designer" }), palette);
    expect(html).toContain("PRODUCT DESIGNER");
    // Uppercased AND escaped: the example tagline contains an ampersand
    // precisely so this path stays covered.
    expect(html).toContain("DESIGN &amp; ENGINEERING STUDIO");
  });

  it("renders the company name as the mark when no logo is set", () => {
    const html = buildSignatureHtml(withData({ logoUrl: "", logoDataUrl: null }), palette);
    expect(html).not.toContain("<img");
    expect(html).toContain("Northwind");
  });

  it("renders the logo at the clamped width when one is set", () => {
    const html = buildSignatureHtml(
      withData({ logoUrl: "https://cdn.example.com/logo.png", logoWidth: 9999 }),
      palette,
    );
    expect(html).toContain('width="360"');
    expect(html).toContain('src="https://cdn.example.com/logo.png"');
  });

  it("links phone, email and each chip, and omits nothing else", () => {
    const html = buildSignatureHtml(withData({ email: "alex@example.com" }), palette);

    expect(html).toContain('href="tel:+15550142"');
    expect(html).toContain('href="mailto:alex@example.com"');
    expect(html).toContain('href="https://example.com/"');
    expect(html).toContain('href="https://example.org/"');
    expect(html).toContain('href="https://example.net/"');
  });

  it("omits whole blocks for empty fields rather than leaving empty boxes", () => {
    const html = buildSignatureHtml(
      withData({ role: "", phone: "", email: "", address: "", links: "" }),
      palette,
    );

    expect(html).not.toContain("href=");
    expect(html).toContain("Alex Rivera");
  });

  it("keeps chips pill-shaped by separating their table's borders", () => {
    const html = buildSignatureHtml(EXAMPLE_SIGNATURE, palette);
    const chipStyles = [...html.matchAll(/style="([^"]*border-radius:18px[^"]*)"/g)];

    expect(chipStyles.length).toBeGreaterThan(0);
    // A bordered cell inside a `border-collapse:collapse` table loses its
    // border-radius, which silently turned every chip into a rectangle.
    expect(html).toContain("border-collapse:separate");
    for (const [, style] of chipStyles) {
      expect(style).toContain("border:1px solid");
    }
  });

  it("gives a lone contact the full width instead of the narrow column", () => {
    // Phone + email fill row one; the address lands alone on row two and
    // must span both columns, or a one-line address wraps to three.
    const html = buildSignatureHtml(
      withData({ phone: "+1 555 0142", email: "alex@example.com", address: "One long line" }),
      palette,
    );

    expect(html).toContain('colspan="2"');
    expect(html).toContain(`width:${DETAILS_COLUMN_WIDTH}px`);
  });

  it("keeps two contacts side by side without a colspan", () => {
    const html = buildSignatureHtml(
      withData({ phone: "+1 555 0142", email: "alex@example.com", address: "" }),
      palette,
    );

    expect(html).not.toContain('colspan="2"');
  });

  it("wraps chips into rows of three so they never rely on flex-wrap", () => {
    const html = buildSignatureHtml(withData({ links: "a.com\nb.com\nc.com\nd.com" }), palette);
    const chipCells = (html.match(/style="padding:0 10px \d+px 0;"/g) ?? []).length;

    expect(chipCells).toBe(4);
    // Three chips share the first row's 10px gutter; the fourth starts a
    // new row and, being last, carries no trailing gap.
    expect((html.match(/style="padding:0 10px 10px 0;"/g) ?? []).length).toBe(3);
    expect((html.match(/style="padding:0 10px 0px 0;"/g) ?? []).length).toBe(1);
    expect(html).toContain('href="https://d.com/"');
  });

  it("leaves no trailing gap below the last block, so the column centres true", () => {
    const withChips = buildSignatureHtml(EXAMPLE_SIGNATURE, palette);
    expect(withChips).toContain('style="padding:0 10px 0px 0;"');

    // Without links, the last contact row becomes the final block instead.
    const withoutChips = buildSignatureHtml(withData({ links: "" }), palette);
    expect(withoutChips).not.toContain("12px 0;");
  });

  it("only ever writes validated hex colours into style attributes", () => {
    const html = buildSignatureHtml(EXAMPLE_SIGNATURE, derivePalette("nope", "also-nope"));

    for (const [, colour] of html.matchAll(/(?:background-)?color:([^;"]+)/g)) {
      expect(colour.trim()).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});
