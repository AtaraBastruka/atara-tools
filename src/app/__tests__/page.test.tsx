import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Home from "../page";

describe("Home", () => {
  it("renders the site title", () => {
    render(<Home />);
    expect(
      screen.getByRole("heading", { name: "Atara Tools" }),
    ).toBeInTheDocument();
  });

  it("lists SVG Convert under Image", () => {
    render(<Home />);
    expect(screen.getByRole("heading", { name: "Image" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "SVG Convert" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /SVG Convert/ })).toHaveAttribute(
      "href",
      "/tools/svg-convert",
    );
  });
});
