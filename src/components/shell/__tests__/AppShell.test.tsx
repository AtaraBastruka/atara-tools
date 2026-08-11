import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AppShell } from "../AppShell";

describe("AppShell", () => {
  it("keeps branding and nav mounted while children change (simulated navigation)", () => {
    const { rerender } = render(
      <AppShell>
        <div>Tool A content</div>
      </AppShell>,
    );

    expect(screen.getByRole("link", { name: "Atara Tools" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Primary" })).toBeInTheDocument();
    expect(screen.getByText("Tool A content")).toBeInTheDocument();

    rerender(
      <AppShell>
        <div>Tool B content</div>
      </AppShell>,
    );

    // Shell chrome persists across the simulated navigation; only the
    // content slot swaps, unmodified by the shell itself.
    expect(screen.getByRole("link", { name: "Atara Tools" })).toBeInTheDocument();
    expect(screen.getByText("Tool B content")).toBeInTheDocument();
    expect(screen.queryByText("Tool A content")).not.toBeInTheDocument();
  });

  it("renders a theme toggle button", () => {
    render(
      <AppShell>
        <div>Content</div>
      </AppShell>,
    );

    expect(screen.getByRole("button", { name: /toggle color theme/i })).toBeInTheDocument();
  });
});
