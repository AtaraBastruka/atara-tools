import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PasswordGeneratorTool from "../Tool";
import { recentsStore } from "../recents";

function mockClipboard() {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.assign(navigator, { clipboard: { writeText } });
  return writeText;
}

describe("PasswordGeneratorTool recents wiring", () => {
  beforeEach(() => {
    // recents.ts caches its list in module scope, so reset via the store
    // itself (not window.localStorage.clear()) or the cache would leak
    // between tests even though storage was wiped.
    recentsStore.clear();
    mockClipboard();
  });

  it("adds each generated value to recents and reflects the count on the button", async () => {
    render(<PasswordGeneratorTool />);

    expect(screen.getByRole("button", { name: "Recents" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Generate" }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Recents (1)" })).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole("button", { name: "Generate" }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Recents (2)" })).toBeInTheDocument(),
    );
  });

  it("opens the recents dialog showing the generated value, copy-only", async () => {
    render(<PasswordGeneratorTool />);

    fireEvent.click(screen.getByRole("button", { name: "Generate" }));
    const resultInput = screen.getByLabelText("Result") as HTMLInputElement;
    await waitFor(() => expect(resultInput.value).not.toBe(""));
    const generated = resultInput.value;

    fireEvent.click(await screen.findByRole("button", { name: "Recents (1)" }));

    const dialog = screen.getByRole("dialog", { name: "Recents" });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText(generated)).toBeInTheDocument();
  });

  it("clears recents via the dialog's Clear all and resets the button count", async () => {
    render(<PasswordGeneratorTool />);

    fireEvent.click(screen.getByRole("button", { name: "Generate" }));
    fireEvent.click(await screen.findByRole("button", { name: "Recents (1)" }));
    fireEvent.click(screen.getByRole("button", { name: /clear all/i }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Recents" })).toBeInTheDocument(),
    );
    expect(screen.queryByRole("button", { name: /^recents \(/i })).not.toBeInTheDocument();
  });

  it("caps the button count at 10 after generating an 11th time, and the dialog stays copy-only", async () => {
    render(<PasswordGeneratorTool />);
    const generateButton = screen.getByRole("button", { name: "Generate" });

    for (let i = 0; i < 11; i += 1) {
      fireEvent.click(generateButton);
    }

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Recents (10)" })).toBeInTheDocument(),
    );
    expect(screen.queryByRole("button", { name: /^recents \(11\)$/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Recents (10)" }));
    const dialog = screen.getByRole("dialog", { name: "Recents" });
    const copyButtons = within(dialog).getAllByRole("button", { name: /^copy$/i });
    expect(copyButtons).toHaveLength(10);
  });

  it("loads recents that were already in storage before the module was evaluated (simulates a reload)", async () => {
    window.localStorage.setItem(
      "password-generator-recents",
      JSON.stringify(["already-there"]),
    );

    // recents.ts reads localStorage once at module-eval time and caches it
    // (see its file comment) — exactly what happens on a real page reload,
    // where the whole JS bundle re-evaluates fresh in the browser. Force
    // the same thing here with a fresh module graph instead of relying on
    // the already-imported instance, which would miss the value we just
    // set directly in storage.
    vi.resetModules();
    const { default: FreshPasswordGeneratorTool } = await import("../Tool");

    render(<FreshPasswordGeneratorTool />);

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Recents (1)" })).toBeInTheDocument(),
    );
  });
});
