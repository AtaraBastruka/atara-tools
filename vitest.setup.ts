import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// `test.globals` isn't enabled in vitest.config.ts, so Testing Library can't
// auto-detect Vitest's `afterEach` to register its automatic DOM cleanup.
// Without this, DOM output from one test leaks into the next test in the
// same file.
afterEach(() => {
  cleanup();
});
