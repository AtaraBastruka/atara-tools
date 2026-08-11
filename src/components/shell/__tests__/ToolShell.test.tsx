import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ToolShell } from "../ToolShell";

describe("ToolShell", () => {
  it("renders the title, description, action bar, and content slots", () => {
    render(
      <ToolShell
        title="Sample Tool"
        description="Does a sample thing."
        actions={<button>Action</button>}
      >
        <p>Tool content</p>
      </ToolShell>,
    );

    expect(screen.getByRole("heading", { name: "Sample Tool" })).toBeInTheDocument();
    expect(screen.getByText("Does a sample thing.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Action" })).toBeInTheDocument();
    expect(screen.getByText("Tool content")).toBeInTheDocument();
  });

  it("renders without an action bar when none is provided", () => {
    render(
      <ToolShell title="No Actions" description="No action bar here.">
        <p>Content only</p>
      </ToolShell>,
    );

    expect(screen.getByRole("heading", { name: "No Actions" })).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
