import { describe, expect, it } from "vitest";
import { renderMarkdown, sanitizeUrl } from "../markdown";

const html = (source: string) => renderMarkdown(source).html;

describe("raw HTML is never executed", () => {
  // These matter more than usual here: this origin's localStorage holds the
  // password generator's recents, so script execution from a .md file the
  // user merely opened would be a real disclosure, not a theoretical one.
  it("renders a script tag as visible text", () => {
    const out = html("<script>alert(1)</script>");
    expect(out).not.toContain("<script>");
    expect(out).toContain("&lt;script&gt;");
  });

  it("renders an event-handler attribute as visible text", () => {
    const out = html('Look: <img src=x onerror="steal()">');
    // The literal substring "onerror=" does survive — inside escaped text,
    // where it is inert. What must not survive is a real tag, so assert on
    // tag syntax rather than on the attribute name.
    expect(out).not.toMatch(/<img/);
    expect(out).toContain("&lt;img");
  });

  it("keeps inline HTML inert inside a table cell", () => {
    const out = html("| a |\n| --- |\n| <b>x</b> |");
    expect(out).toContain("&lt;b&gt;");
    expect(out).not.toContain("<b>");
  });
});

describe("sanitizeUrl", () => {
  it("keeps ordinary web and contact schemes", () => {
    expect(sanitizeUrl("https://example.com/a?b=1")).toBe("https://example.com/a?b=1");
    expect(sanitizeUrl("mailto:alex@example.com")).toBe("mailto:alex@example.com");
    expect(sanitizeUrl("./relative/path.md")).toBe("./relative/path.md");
    expect(sanitizeUrl("#anchor")).toBe("#anchor");
  });

  it("rejects javascript:, including whitespace-obfuscated forms", () => {
    expect(sanitizeUrl("javascript:alert(1)")).toBeNull();
    expect(sanitizeUrl("JaVaScRiPt:alert(1)")).toBeNull();
    // Browsers ignore control characters inside the scheme, so the check
    // has to run against a stripped copy rather than the raw string.
    expect(sanitizeUrl("java\tscript:alert(1)")).toBeNull();
    expect(sanitizeUrl("java\nscript:alert(1)")).toBeNull();
  });

  it("allows data: only for images, and only where an image is expected", () => {
    const png = "data:image/png;base64,iVBORw0KGgo=";
    expect(sanitizeUrl(png, true)).toBe(png);
    expect(sanitizeUrl(png)).toBeNull();
    expect(sanitizeUrl("data:text/html;base64,PHNjcmlwdD4=", true)).toBeNull();
  });

  it("drops a link whose target is unsafe rather than emitting a dead anchor", () => {
    const out = html("[click me](javascript:alert(1))");
    expect(out).not.toContain("<a");
    expect(out).toContain("click me");
  });
});

describe("block structure", () => {
  it("renders headings with their level", () => {
    expect(html("# One")).toBe("<h1>One</h1>");
    expect(html("### Three")).toBe("<h3>Three</h3>");
  });

  it("joins wrapped lines into a single paragraph", () => {
    expect(html("one\ntwo")).toBe("<p>one two</p>");
  });

  it("honours a hard line break from two trailing spaces", () => {
    expect(html("one  \ntwo")).toContain("<br />");
  });

  it("renders a fenced code block without interpreting its contents", () => {
    const out = html("```ts\nconst a = **b**;\n```");
    expect(out).toContain('<code class="language-ts">');
    expect(out).toContain("const a = **b**;");
    expect(out).not.toContain("<strong>");
  });

  it("renders blockquotes", () => {
    expect(html("> quoted")).toBe("<blockquote><p>quoted</p></blockquote>");
  });

  it("renders horizontal rules", () => {
    expect(html("---")).toBe("<hr />");
  });
});

describe("lists", () => {
  it("renders a tight bullet list without paragraph wrappers", () => {
    expect(html("- a\n- b")).toBe("<ul><li>a</li><li>b</li></ul>");
  });

  it("renders an ordered list and preserves a non-1 start", () => {
    expect(html("1. a\n2. b")).toBe("<ol><li>a</li><li>b</li></ol>");
    expect(html("3. a")).toContain('<ol start="3">');
  });

  it("nests a deeper list inside the item above it", () => {
    expect(html("- a\n  - b")).toBe("<ul><li>a<ul><li>b</li></ul></li></ul>");
  });
});

describe("tables", () => {
  it("renders a header row and body rows", () => {
    const out = html("| a | b |\n| --- | --- |\n| 1 | 2 |");
    expect(out).toContain("<th>a</th><th>b</th>");
    expect(out).toContain("<td>1</td><td>2</td>");
  });

  it("applies column alignment from the separator row", () => {
    const out = html("| l | c | r |\n| :-- | :-: | --: |\n| 1 | 2 | 3 |");
    expect(out).toContain("text-align:left");
    expect(out).toContain("text-align:center");
    expect(out).toContain("text-align:right");
  });

  it("pads a ragged row so later columns do not shift", () => {
    const out = html("| a | b |\n| --- | --- |\n| 1 |");
    expect(out).toContain("<td>1</td><td></td>");
  });
});

describe("inline markup", () => {
  it("renders bold, italic, strikethrough and code", () => {
    expect(html("**b**")).toContain("<strong>b</strong>");
    expect(html("*i*")).toContain("<em>i</em>");
    expect(html("~~s~~")).toContain("<del>s</del>");
    expect(html("`c`")).toContain("<code>c</code>");
  });

  it("leaves markup inside a code span literal", () => {
    expect(html("`**not bold**`")).toContain("<code>**not bold**</code>");
  });

  it("keeps bold wrapping around an inline code span", () => {
    // Common in technical notes: the phrase is bold, a term inside it is code.
    // Splitting on code first used to leave the asterisks visible in print.
    expect(html("**No `portalCategory`.**")).toBe(
      "<p><strong>No <code>portalCategory</code>.</strong></p>",
    );
    expect(html("1. **Reduced `calendarValues`.** rest")).toBe(
      "<ol><li><strong>Reduced <code>calendarValues</code>.</strong> rest</li></ol>",
    );
    expect(html("** `featureContentRate: false` **")).toBe(
      "<p><strong> <code>featureContentRate: false</code> </strong></p>",
    );
  });

  it("does not italicise snake_case identifiers", () => {
    const out = html("call some_function_name now");
    expect(out).not.toContain("<em>");
    expect(out).toContain("some_function_name");
  });

  it("links bare URLs", () => {
    expect(html("see https://example.com now")).toContain('<a href="https://example.com">');
  });
});

describe("title extraction", () => {
  it("takes the first level-1 heading", () => {
    expect(renderMarkdown("# Report\n\ntext").title).toBe("Report");
  });

  it("ignores deeper headings", () => {
    expect(renderMarkdown("## Sub\n\ntext").title).toBeNull();
  });

  it("is null for a document with no heading", () => {
    expect(renderMarkdown("just text").title).toBeNull();
  });
});
