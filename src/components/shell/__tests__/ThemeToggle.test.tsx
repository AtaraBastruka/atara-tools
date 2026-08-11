import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { ThemeToggle } from "../ThemeToggle";

describe("ThemeToggle", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
  });

  it("toggles the root element's theme and persists the manual override", () => {
    render(<ThemeToggle />);
    const button = screen.getByRole("button", { name: /toggle color theme/i });

    fireEvent.click(button);
    const first = document.documentElement.getAttribute("data-theme");
    expect(first).toMatch(/^(light|dark)$/);
    expect(window.localStorage.getItem("theme")).toBe(first);

    fireEvent.click(button);
    const second = document.documentElement.getAttribute("data-theme");
    expect(second).not.toBe(first);
    expect(window.localStorage.getItem("theme")).toBe(second);
  });
});
