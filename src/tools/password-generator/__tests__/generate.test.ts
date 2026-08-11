import { describe, expect, it, vi } from "vitest";
import { CHARSETS, generatePassword } from "../generate";

function allEnabled(overrides: Partial<Parameters<typeof generatePassword>[0]> = {}) {
  return {
    length: 64,
    lower: true,
    upper: true,
    digits: true,
    symbols: true,
    ...overrides,
  };
}

describe("generatePassword", () => {
  it("returns a string of exactly the requested length", () => {
    expect(generatePassword(allEnabled({ length: 24 }))).toHaveLength(24);
    expect(generatePassword(allEnabled({ length: 1 }))).toHaveLength(1);
    expect(generatePassword(allEnabled({ length: 128 }))).toHaveLength(128);
  });

  it("covers every enabled charset across a long generation (charset coverage)", () => {
    const result = generatePassword(allEnabled({ length: 256 }));

    expect([...result].some((char) => CHARSETS.lower.includes(char))).toBe(true);
    expect([...result].some((char) => CHARSETS.upper.includes(char))).toBe(true);
    expect([...result].some((char) => CHARSETS.digits.includes(char))).toBe(true);
    expect([...result].some((char) => CHARSETS.symbols.includes(char))).toBe(true);
  });

  it("only uses characters from enabled charsets and excludes disabled ones", () => {
    const result = generatePassword(
      allEnabled({ length: 128, symbols: false, upper: false }),
    );
    const allowed = new Set(CHARSETS.lower + CHARSETS.digits);

    expect([...result].every((char) => allowed.has(char))).toBe(true);
    expect([...result].some((char) => CHARSETS.symbols.includes(char))).toBe(false);
    expect([...result].some((char) => CHARSETS.upper.includes(char))).toBe(false);
  });

  it("length 24 with symbols disabled produces exactly 24 characters with no symbols", () => {
    const result = generatePassword(
      allEnabled({ length: 24, symbols: false }),
    );

    expect(result).toHaveLength(24);
    expect([...result].some((char) => CHARSETS.symbols.includes(char))).toBe(false);
  });

  it("throws when no charset is enabled", () => {
    expect(() =>
      generatePassword({ length: 16, lower: false, upper: false, digits: false, symbols: false }),
    ).toThrow();
  });

  it("throws for a non-positive or non-integer length", () => {
    expect(() => generatePassword(allEnabled({ length: 0 }))).toThrow();
    expect(() => generatePassword(allEnabled({ length: -5 }))).toThrow();
    expect(() => generatePassword(allEnabled({ length: 1.5 }))).toThrow();
  });

  it("rejection-samples out-of-range bytes instead of taking a biased modulo", () => {
    // digits charset has length 10; the rejection ceiling is 256 - (256 % 10) = 250.
    // A byte >= 250 must be discarded and re-drawn — it must never appear in
    // the output as (byte % 10), which would silently bias low digits.
    const getRandomValues = vi.spyOn(crypto, "getRandomValues");
    const sequence = [255, 253, 250, 7]; // first three are >= 250 and must be rejected
    let call = 0;
    getRandomValues.mockImplementation(((array: Uint8Array) => {
      array[0] = sequence[call];
      call += 1;
      return array;
    }) as typeof crypto.getRandomValues);

    const result = generatePassword({
      length: 1,
      lower: false,
      upper: false,
      digits: true,
      symbols: false,
    });

    expect(call).toBe(sequence.length);
    expect(result).toBe(CHARSETS.digits[7 % 10]);

    getRandomValues.mockRestore();
  });
});
