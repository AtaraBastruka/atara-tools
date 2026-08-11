import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { Dialog } from "../Dialog";

describe("Dialog", () => {
  it("renders nothing while closed", () => {
    render(
      <Dialog open={false} onClose={vi.fn()} title="Hidden">
        <p>Content</p>
      </Dialog>,
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders as an accessible modal with the title and content when open", () => {
    render(
      <Dialog open onClose={vi.fn()} title="My Dialog">
        <p>Dialog content</p>
      </Dialog>,
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(screen.getByRole("heading", { name: "My Dialog" })).toBeInTheDocument();
    expect(screen.getByText("Dialog content")).toBeInTheDocument();
  });

  it("calls onClose when the Close button is clicked", () => {
    const onClose = vi.fn();
    render(
      <Dialog open onClose={onClose} title="My Dialog">
        <p>Content</p>
      </Dialog>,
    );

    fireEvent.click(screen.getByRole("button", { name: /close dialog/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when Escape is pressed", () => {
    const onClose = vi.fn();
    render(
      <Dialog open onClose={onClose} title="My Dialog">
        <p>Content</p>
      </Dialog>,
    );

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose on a backdrop click but not on a click inside the dialog content", () => {
    const onClose = vi.fn();
    render(
      <Dialog open onClose={onClose} title="My Dialog">
        <p>Content</p>
      </Dialog>,
    );

    fireEvent.click(screen.getByText("Content"));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("dialog").parentElement as Element);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("moves focus into the dialog on open and restores it to the trigger on close", () => {
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <div>
          <button onClick={() => setOpen(true)}>Open</button>
          <Dialog open={open} onClose={() => setOpen(false)} title="Focus test">
            <p>Content</p>
          </Dialog>
        </div>
      );
    }

    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "Open" });
    trigger.focus();
    fireEvent.click(trigger);

    expect(screen.getByRole("dialog")).toHaveFocus();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(trigger).toHaveFocus();
  });
});
