export interface GeneratePasswordOptions {
  length: number;
  lower: boolean;
  upper: boolean;
  digits: boolean;
  symbols: boolean;
}

export const CHARSETS = {
  lower: "abcdefghijklmnopqrstuvwxyz",
  upper: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  digits: "0123456789",
  symbols: "!@#$%^&*()-_=+[]{}:;,.<>?/~",
} as const;

const CHARSET_KEYS = Object.keys(CHARSETS) as (keyof typeof CHARSETS)[];

/**
 * Uniformly-distributed index in [0, max) from crypto.getRandomValues via
 * rejection sampling: bytes at or above the largest multiple of `max` that
 * fits in a byte are discarded and re-drawn, so `% max` never lands on a
 * remainder that occurs more often than the others (no modulo bias), for
 * any charset length up to 256.
 */
function randomIndex(max: number): number {
  if (max <= 0 || max > 256) {
    throw new Error("randomIndex: max must be in (0, 256]");
  }
  const rejectionCeiling = 256 - (256 % max);
  const byte = new Uint8Array(1);
  let value: number;
  do {
    crypto.getRandomValues(byte);
    value = byte[0];
  } while (value >= rejectionCeiling);
  return value % max;
}

function buildCharset(opts: GeneratePasswordOptions): string {
  return CHARSET_KEYS.filter((key) => opts[key])
    .map((key) => CHARSETS[key])
    .join("");
}

/**
 * Generates a random string client-side via a cryptographically secure
 * random source — this is a generator, never a transform of prior input.
 * Never offer/implement encrypt, hash, or encode modes here (see spec:
 * secret-generator domain).
 */
export function generatePassword(opts: GeneratePasswordOptions): string {
  if (!Number.isInteger(opts.length) || opts.length <= 0) {
    throw new Error("generatePassword: length must be a positive integer");
  }

  const charset = buildCharset(opts);
  if (charset.length === 0) {
    throw new Error("generatePassword: at least one character set must be enabled");
  }

  let result = "";
  for (let i = 0; i < opts.length; i += 1) {
    result += charset[randomIndex(charset.length)];
  }
  return result;
}
