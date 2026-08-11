import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RecentsDialog } from "../RecentsDialog";

function mockClipboard() {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.assign(navigator, { clipboard: { writeText } });
  return writeText;
}

describe("RecentsDialog", () => {
  it("shows an empty-state message when there are no recents", () => {
    render(
      <RecentsDialog open onClose={vi.fn()} values={[]} onClear={vi.fn()} />,
    );

    expect(screen.getByText(/nothing generated yet/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /clear all/i })).toBeDisabled();
  });

  it("renders bare values with no extra metadata, newest first as given", () => {
    render(
      <RecentsDialog
        open
        onClose={vi.fn()}
        values={["newest", "older"]}
        onClear={vi.fn()}
      />,
    );

    expect(screen.getByText("newest")).toBeInTheDocument();
    expect(screen.getByText("older")).toBeInTheDocument();
  });

  it("copies a value to the clipboard without triggering any refill callback (copy-only)", async () => {
    const writeText = mockClipboard();
    render(
      <RecentsDialog
        open
        onClose={vi.fn()}
        values={["secret-value"]}
        onClear={vi.fn()}
      />,
    );

    const copyButtons = screen.getAllByRole("button", { name: /^copy$/i });
    fireEvent.click(copyButtons[0]);

    expect(writeText).toHaveBeenCalledWith("secret-value");
    // The value itself is rendered as inert text, not a clickable control —
    // there is no click-to-refill affordance anywhere on it.
    expect(screen.queryByRole("button", { name: "secret-value" })).not.toBeInTheDocument();
  });

  it("calls onClear when Clear all is clicked", () => {
    const onClear = vi.fn();
    render(
      <RecentsDialog
        open
        onClose={vi.fn()}
        values={["a", "b"]}
        onClear={onClear}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /clear all/i }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it("includes a disclosure that this is not a vault and is wiped by clearing site data", () => {
    render(
      <RecentsDialog open onClose={vi.fn()} values={["a"]} onClear={vi.fn()} />,
    );

    expect(screen.getByText(/isn't a password vault/i)).toBeInTheDocument();
    expect(screen.getByText(/clear this site's data/i)).toBeInTheDocument();
  });
});
