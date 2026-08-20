/**
 * Zero-dependency Markdown → HTML, feeding the print/PDF pipeline in
 * ./document.ts. Hand-rolled to match the rest of the catalog: no tool in
 * this project pulls a runtime dependency, and a parser for the common
 * subset is small enough to own outright.
 *
 * SECURITY — why raw HTML is not supported, deliberately:
 * Markdown normally lets a document embed literal HTML. This tool renders
 * files the user did not necessarily write (a README from a repo, a doc
 * someone sent them) on the SAME ORIGIN that stores the password
 * generator's recents in localStorage. Honouring `<img onerror=...>` or a
 * `<script>` tag from such a file would hand it those saved secrets. So
 * every source byte is escaped before any markup is produced: HTML in the
 * input is shown as text, never executed. See sanitizeUrl for the matching
 * restriction on link targets.
 */

const ESCAPE_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ESCAPE_MAP[character]);
}

/**
 * Returns the URL if it is safe to put in an href/src, or null to drop the
 * link. Escaping alone does not cover this: `[x](javascript:...)` contains
 * no HTML metacharacters, so it survives escapeHtml untouched and would
 * still execute on click.
 *
 * Tested against a copy with whitespace and control characters removed,
 * because browsers read `java\tscript:` and `java\nscript:` as the
 * javascript: scheme. Entity obfuscation (`&#106;avascript:`) cannot reach
 * here — escapeHtml has already turned the leading `&` into `&amp;`.
 */
export function sanitizeUrl(raw: string, allowInlineImage = false): string | null {
  const url = raw.trim();
  if (!url) return null;

  const collapsed = url.replace(/[\s\u0000-\u001F\u007F]/g, "");
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(collapsed);

  if (scheme) {
    const protocol = scheme[1].toLowerCase();

    if (protocol === "data") {
      // Only image payloads, and only where an image is expected. A
      // data:text/html URL is a same-origin script vector.
      return allowInlineImage &&
        /^data:image\/(png|jpe?g|gif|webp|avif|svg\+xml);/i.test(collapsed)
        ? url
        : null;
    }

    const ALLOWED = ["http", "https", "mailto", "tel"];
    if (!ALLOWED.includes(protocol)) return null;
  }

  return url;
}

// Inline code wins over every other inline rule: `**not bold**` inside a
// code span must stay literal, so emphasis is only applied to the segments
// between code spans.
const CODE_SPAN = /(`+)([\s\S]+?)\1/g;
// Titles arrive as &quot; because the source was escaped before parsing.
const IMAGE = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;[^&]*&quot;)?\)/g;
const LINK = /\[([^\]]+)\]\(([^)\s]+)(?:\s+&quot;[^&]*&quot;)?\)/g;
const AUTOLINK = /(^|[\s(])((?:https?:\/\/|www\.)[^\s<>()]+[^\s<>().,;:!?])/g;

function renderEmphasis(text: string): string {
  return (
    text
      .replace(IMAGE, (_match, alt: string, href: string) => {
        const src = sanitizeUrl(href, true);
        return src === null ? alt : `<img src="${src}" alt="${alt}" />`;
      })
      .replace(LINK, (_match, label: string, href: string) => {
        const target = sanitizeUrl(href);
        return target === null ? label : `<a href="${target}">${label}</a>`;
      })
      .replace(AUTOLINK, (match, lead: string, url: string) => {
        const target = sanitizeUrl(url.startsWith("www.") ? `https://${url}` : url);
        return target === null ? match : `${lead}<a href="${target}">${url}</a>`;
      })
      .replace(/\*\*([\s\S]+?)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[\s(])__([\s\S]+?)__(?=[\s).,!?;:]|$)/g, "$1<strong>$2</strong>")
      .replace(/~~([\s\S]+?)~~/g, "<del>$1</del>")
      .replace(/(^|[^*])\*([^*\s][\s\S]*?)\*/g, "$1<em>$2</em>")
      // `_` requires word boundaries so snake_case_names survive intact.
      .replace(/(^|[\s(])_([^_\s][\s\S]*?)_(?=[\s).,!?;:]|$)/g, "$1<em>$2</em>")
  );
}

/** Applies inline markup to text that has ALREADY been HTML-escaped. */
export function renderInline(escaped: string): string {
  let out = "";
  let last = 0;
  let match: RegExpExecArray | null;

  CODE_SPAN.lastIndex = 0;
  while ((match = CODE_SPAN.exec(escaped)) !== null) {
    out += renderEmphasis(escaped.slice(last, match.index));
    out += `<code>${match[2].trim()}</code>`;
    last = match.index + match[0].length;
  }

  return out + renderEmphasis(escaped.slice(last));
}

/** Escapes then applies inline markup. Every leaf goes through here. */
function inline(raw: string): string {
  return renderInline(escapeHtml(raw));
}

const FENCE = /^(\s*)(`{3,}|~{3,})\s*([\w+#-]*)\s*$/;
const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const RULE = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/;
const QUOTE = /^\s*>\s?(.*)$/;
const LIST_ITEM = /^(\s*)([-*+]|\d{1,9}[.)])\s+(.*)$/;

interface ListItem {
  indent: number;
  ordered: boolean;
  start: number;
  lines: string[];
}

/**
 * Splits a table row into trimmed cells. Escaped pipes are not supported —
 * a documented gap rather than a silent one, since supporting them needs a
 * character-level scanner for a case that essentially never appears.
 */
function splitRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function isTableSeparator(line: string): boolean {
  if (!line.includes("-") || !line.includes("|")) return false;
  const cells = splitRow(line);
  return cells.length > 1 && cells.every((cell) => /^:?-+:?$/.test(cell));
}

function alignmentOf(cell: string): string {
  const left = cell.startsWith(":");
  const right = cell.endsWith(":");
  if (left && right) return " style=\"text-align:center\"";
  if (right) return " style=\"text-align:right\"";
  if (left) return " style=\"text-align:left\"";
  return "";
}

/**
 * Renders one list item's body. A "tight" item — a single paragraph — is
 * unwrapped so `<li>text</li>` does not pick up paragraph margins, which is
 * what makes a simple bullet list print at the right density.
 */
function renderItemBody(lines: string[]): string {
  const html = renderBlocks(lines);
  const single = /^<p>([\s\S]*)<\/p>$/.exec(html.trim());
  return single && !single[1].includes("<p>") ? single[1] : html;
}

function buildList(items: ListItem[], cursor: { index: number }, indent: number): string {
  const first = items[cursor.index];
  const ordered = first.ordered;
  const parts: string[] = [];

  while (cursor.index < items.length && items[cursor.index].indent >= indent) {
    const item = items[cursor.index];

    if (item.indent > indent) {
      // Deeper marker: belongs inside the item just emitted.
      const nested = buildList(items, cursor, item.indent);
      parts[parts.length - 1] = parts[parts.length - 1].replace(
        /<\/li>$/,
        `${nested}</li>`,
      );
      continue;
    }

    if (item.ordered !== ordered) break;
    cursor.index += 1;
    parts.push(`<li>${renderItemBody(item.lines)}</li>`);
  }

  const tag = ordered ? "ol" : "ul";
  const startAttr = ordered && first.start !== 1 ? ` start="${first.start}"` : "";
  return `<${tag}${startAttr}>${parts.join("")}</${tag}>`;
}

function renderBlocks(lines: string[]): string {
  const out: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) {
      i += 1;
      continue;
    }

    const fence = FENCE.exec(line);
    if (fence) {
      const marker = fence[2][0];
      const language = fence[3];
      const body: string[] = [];
      i += 1;
      while (i < lines.length && !new RegExp(`^\\s*${marker}{3,}\\s*$`).test(lines[i])) {
        body.push(lines[i]);
        i += 1;
      }
      i += 1; // closing fence, or end of input
      const languageClass = language ? ` class="language-${escapeHtml(language)}"` : "";
      out.push(`<pre><code${languageClass}>${escapeHtml(body.join("\n"))}</code></pre>`);
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      const level = heading[1].length;
      out.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      i += 1;
      continue;
    }

    if (RULE.test(line)) {
      out.push("<hr />");
      i += 1;
      continue;
    }

    if (QUOTE.test(line)) {
      const body: string[] = [];
      while (i < lines.length && QUOTE.test(lines[i])) {
        body.push((QUOTE.exec(lines[i]) as RegExpExecArray)[1]);
        i += 1;
      }
      out.push(`<blockquote>${renderBlocks(body)}</blockquote>`);
      continue;
    }

    if (line.includes("|") && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      const header = splitRow(line);
      const alignments = splitRow(lines[i + 1]).map(alignmentOf);
      i += 2;
      const rows: string[] = [];
      while (i < lines.length && lines[i].includes("|") && lines[i].trim()) {
        rows.push(lines[i]);
        i += 1;
      }
      const head = header
        .map((cell, index) => `<th${alignments[index] ?? ""}>${inline(cell)}</th>`)
        .join("");
      const body = rows
        .map((row) => {
          const cells = splitRow(row);
          // Pad or trim to the header width so a ragged row cannot shift
          // every following column.
          const normalized = header.map((_, index) => cells[index] ?? "");
          return `<tr>${normalized
            .map((cell, index) => `<td${alignments[index] ?? ""}>${inline(cell)}</td>`)
            .join("")}</tr>`;
        })
        .join("");
      out.push(`<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`);
      continue;
    }

    if (LIST_ITEM.test(line)) {
      const items: ListItem[] = [];
      while (i < lines.length) {
        const match = LIST_ITEM.exec(lines[i]);
        if (match) {
          const marker = match[2];
          items.push({
            indent: match[1].replace(/\t/g, "    ").length,
            ordered: /\d/.test(marker),
            start: Number.parseInt(marker, 10) || 1,
            lines: [match[3]],
          });
          i += 1;
          continue;
        }
        if (!lines[i].trim()) {
          // A blank line only ends the list if what follows is not part of it.
          const next = lines[i + 1];
          if (next && (LIST_ITEM.test(next) || /^\s{2,}\S/.test(next))) {
            items[items.length - 1]?.lines.push("");
            i += 1;
            continue;
          }
          break;
        }
        if (items.length && /^\s{2,}\S/.test(lines[i])) {
          items[items.length - 1].lines.push(lines[i].replace(/^\s{2,}/, ""));
          i += 1;
          continue;
        }
        break;
      }
      out.push(buildList(items, { index: 0 }, items[0].indent));
      continue;
    }

    const paragraph: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !HEADING.test(lines[i]) &&
      !RULE.test(lines[i]) &&
      !QUOTE.test(lines[i]) &&
      !FENCE.test(lines[i]) &&
      !LIST_ITEM.test(lines[i])
    ) {
      paragraph.push(lines[i]);
      i += 1;
    }
    // Two trailing spaces is Markdown's hard line break; without them a
    // wrapped source line is just part of the same paragraph.
    //
    // The break is carried as a newline through inline rendering and only
    // becomes a tag afterwards. Emitting `<br />` up front would hand it to
    // escapeHtml, which turns it into visible `&lt;br /&gt;` text; rendering
    // each line separately instead would break inline markup that spans a
    // line, like a **bold phrase that wraps**.
    let text = "";
    paragraph.forEach((entry, index) => {
      text += entry.trim();
      if (index < paragraph.length - 1) {
        text += /\s{2,}$/.test(entry) ? "\n" : " ";
      }
    });
    out.push(`<p>${inline(text).replace(/\n/g, "<br />")}</p>`);
  }

  return out.join("");
}

export interface MarkdownDocument {
  html: string;
  /** First level-1 heading, used to title the PDF and name the file. */
  title: string | null;
}

export function renderMarkdown(source: string): MarkdownDocument {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const heading = lines.find((line) => /^#\s+\S/.test(line));

  return {
    html: renderBlocks(lines),
    title: heading ? heading.replace(/^#\s+/, "").trim() : null,
  };
}
