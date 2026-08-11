import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("next/dynamic", () => ({
  default: () => () => null,
}));

import ToolPage, { generateStaticParams } from "../page";

describe("ToolPage", () => {
  it("calls notFound() for a slug that isn't in the registry", async () => {
    await expect(
      ToolPage({ params: Promise.resolve({ slug: "does-not-exist" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("calls notFound() for the reserved placeholder slug (empty-catalog fallback)", async () => {
    await expect(
      ToolPage({ params: Promise.resolve({ slug: "__placeholder__" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });
});

describe("generateStaticParams", () => {
  it("returns one entry per registered tool slug", () => {
    expect(generateStaticParams()).toEqual([{ slug: "password-generator" }]);
  });
});
