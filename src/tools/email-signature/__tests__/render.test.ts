import { describe, expect, it } from "vitest";
import {
  BRAND_COLUMN_WIDTH,
  DETAILS_COLUMN_WIDTH,
  EXAMPLE_SIGNATURE,
  METRICS,
  SIGNATURE_WIDTH,
  TYPE,
  type SignatureData,
} from "../signature";
import {
  buildPngFileName,
  CANVAS_WIDTH,
  CARD_PADDING_X,
  computeSignatureLayout,
  OUTER_MARGIN,
} from "../render";

function withData(overrides: Partial<SignatureData>): SignatureData {
  return { ...EXAMPLE_SIGNATURE, ...overrides };
}

describe("computeSignatureLayout", () => {
  it("keeps the card inside the canvas on both axes", () => {
    const layout = computeSignatureLayout(EXAMPLE_SIGNATURE, 0.28);

    expect(layout.width).toBe(CANVAS_WIDTH);
    expect(layout.cardX + layout.cardWidth).toBe(CANVAS_WIDTH - OUTER_MARGIN);
    expect(layout.cardY + layout.cardHeight).toBe(layout.height - OUTER_MARGIN);
  });

  it("puts the divider between the two columns and leaves positive room for details", () => {
    const layout = computeSignatureLayout(EXAMPLE_SIGNATURE, 0.28);
    const brandRight = OUTER_MARGIN + CARD_PADDING_X + BRAND_COLUMN_WIDTH;

    expect(layout.dividerX).toBeGreaterThan(brandRight);
    expect(layout.detailsX).toBeGreaterThan(layout.dividerX);
    expect(layout.detailsWidth).toBeGreaterThan(0);
  });

  it("grows taller as content is added, never shorter than the minimum card", () => {
    const minimal = computeSignatureLayout(
      withData({ role: "", phone: "", email: "", address: "", links: "", tagline: "" }),
      null,
    );
    const full = computeSignatureLayout(
      withData({ email: "alex@example.com", links: "a.com\nb.com\nc.com\nd.com" }),
      0.28,
    );

    expect(minimal.contentHeight).toBe(140);
    expect(full.height).toBeGreaterThan(minimal.height);
  });

  it("scales the logo box from the real aspect ratio when one is known", () => {
    // Details stripped back so the brand column is what drives height —
    // otherwise the taller details column masks the logo's contribution.
    const brandOnly = { logoWidth: 200, role: "", phone: "", email: "", address: "", links: "" };
    const wide = computeSignatureLayout(withData(brandOnly), 0.25);
    const tall = computeSignatureLayout(withData(brandOnly), 1);

    expect(wide.logoWidth).toBe(200);
    expect(wide.logoHeight).toBe(50);
    expect(tall.logoHeight).toBe(200);
    expect(tall.brandHeight).toBeGreaterThan(wide.brandHeight);
    expect(tall.height).toBeGreaterThan(wide.height);
  });

  it("keeps the details column driving height when it is the taller of the two", () => {
    const layout = computeSignatureLayout(
      withData({ email: "alex@example.com", links: "a.com\nb.com\nc.com\nd.com" }),
      0.25,
    );

    expect(layout.detailsHeight).toBeGreaterThan(layout.brandHeight);
    expect(layout.contentHeight).toBe(layout.detailsHeight);
  });

  it("clamps the logo width the same way the HTML export does", () => {
    expect(computeSignatureLayout(withData({ logoWidth: 9999 }), 0.25).logoWidth).toBe(360);
  });

  it("carries the same contacts and links the HTML export renders", () => {
    const layout = computeSignatureLayout(withData({ email: "alex@example.com" }), 0.28);

    expect(layout.contacts).toHaveLength(3);
    expect(layout.links.map((link) => link.label)).toEqual([
      "example.com",
      "example.org",
      "example.net",
    ]);
  });
});

describe("the PNG and the HTML share one scale", () => {
  it("draws the card at exactly the width the HTML renders at", () => {
    // The regression this guards: the canvas used to be a flat 1200px
    // while the HTML rendered at 998px. Same font sizes on a wider
    // canvas made every line except the name ~20% smaller in the export.
    const layout = computeSignatureLayout(EXAMPLE_SIGNATURE, 0.28, "boxed");

    expect(layout.cardWidth).toBe(SIGNATURE_WIDTH);
    expect(CANVAS_WIDTH).toBe(SIGNATURE_WIDTH + OUTER_MARGIN * 2);
  });

  it("splits the columns exactly where the HTML does", () => {
    const layout = computeSignatureLayout(EXAMPLE_SIGNATURE, 0.28, "boxed");
    const brandRight = OUTER_MARGIN + METRICS.cardPaddingX + BRAND_COLUMN_WIDTH;

    expect(layout.dividerX).toBe(brandRight + METRICS.columnGap);
    expect(layout.detailsX).toBe(
      brandRight + METRICS.columnGap * 2 + METRICS.dividerWidth,
    );
    expect(layout.detailsWidth).toBe(DETAILS_COLUMN_WIDTH);
  });

  it("keeps body copy large enough to read against the name", () => {
    // The name dwarfing everything else is exactly what the drift looked
    // like from the outside, so the ratio is pinned rather than the sizes.
    expect(TYPE.value.size / TYPE.name.size).toBeGreaterThan(0.4);
    expect(TYPE.label.size).toBeGreaterThanOrEqual(11);
    expect(TYPE.value.size).toBeGreaterThanOrEqual(15);
    expect(TYPE.value.line).toBeGreaterThan(TYPE.value.size);
  });
});

describe("bare mode geometry", () => {
  it("drops the card's padding and margin so the bitmap hugs the content", () => {
    const boxed = computeSignatureLayout(EXAMPLE_SIGNATURE, 0.28, "boxed");
    const bare = computeSignatureLayout(EXAMPLE_SIGNATURE, 0.28, "bare");

    expect(bare.height).toBeLessThan(boxed.height);
    expect(bare.cardX).toBe(0);
    expect(bare.contentTop).toBeLessThan(boxed.contentTop);
    // Same content, so the column split must not move relative to itself.
    expect(bare.detailsWidth).toBeGreaterThan(0);
    expect(bare.detailsX).toBeGreaterThan(bare.dividerX);
  });

  it("does not hold a minimum card height open when there is no card", () => {
    const sparse = { role: "", phone: "", email: "", address: "", links: "", tagline: "" };
    const boxed = computeSignatureLayout(withData(sparse), null, "boxed");
    const bare = computeSignatureLayout(withData(sparse), null, "bare");

    expect(boxed.contentHeight).toBe(140);
    expect(bare.contentHeight).toBeLessThan(140);
  });

  it("defaults to boxed when no mode is given", () => {
    expect(computeSignatureLayout(EXAMPLE_SIGNATURE, 0.28)).toEqual(
      computeSignatureLayout(EXAMPLE_SIGNATURE, 0.28, "boxed"),
    );
  });
});

describe("buildPngFileName", () => {
  it("slugifies the name, stripping accents and punctuation", () => {
    expect(buildPngFileName("Alex Rivera")).toBe("alex-rivera-signature.png");
    expect(buildPngFileName("  J. Doe / Jr.  ")).toBe("j-doe-jr-signature.png");
  });

  it("falls back to a generic name when there is nothing to slugify", () => {
    expect(buildPngFileName("")).toBe("email-signature.png");
    expect(buildPngFileName("!!!")).toBe("email-signature.png");
  });
});
