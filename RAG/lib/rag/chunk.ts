export type Chunk = {
  heading: string;
  content: string;
  url?: string;
  tools: string[];
};

export type Visibility = "public" | "internal" | "restricted";
const VISIBILITIES: readonly string[] = ["public", "internal", "restricted"];

const MAX_CHARS = 3000; // ~800 токенів
const OVERLAP = 300;

/**
 * Читає `visibility:` із YAML-frontmatter на початку дока.
 * Без мітки або з невідомою міткою — internal (fail closed: клієнт не побачить).
 */
export function parseFrontmatter(md: string): { visibility: Visibility; body: string } {
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/);
  const raw = m?.[1].match(/^visibility:\s*["']?(\w+)["']?\s*$/m)?.[1]?.toLowerCase() ?? "";
  return {
    visibility: VISIBILITIES.includes(raw) ? (raw as Visibility) : "internal",
    body: m ? md.slice(m[0].length) : md,
  };
}

/** Ділить markdown за секціями `## ` (поза блоками коду). Текст до першої секції йде як "Intro". */
export function splitByHeadings(md: string): { heading: string; body: string }[] {
  const sections: string[][] = [[]];
  let inFence = false;
  for (const line of md.split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
    if (!inFence && /^##\s/.test(line)) sections.push([]);
    sections[sections.length - 1].push(line);
  }
  return sections
    .map((lines) => lines.join("\n").trim())
    .filter(Boolean)
    .map((body) => ({
      heading: body.startsWith("## ") || body.startsWith("##\t") ? body.split("\n")[0].replace(/^##\s+/, "").trim() : "Intro",
      body,
    }));
}

/** Ріже завеликий текст на шматки з перекриттям, по можливості по абзацах. */
export function splitBySize(text: string, max = MAX_CHARS, overlap = OVERLAP): string[] {
  if (text.length <= max) return [text];
  const out: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + max, text.length);
    if (end < text.length) {
      const para = text.lastIndexOf("\n\n", end);
      if (para > start + max / 2) end = para;
    }
    out.push(text.slice(start, end).trim());
    if (end >= text.length) break;
    start = Math.max(end - overlap, start + 1);
  }
  return out;
}

/** Витягує `- URL: ...` та `- Tools: a, b` / `- Дії (tools): a, b` із секції. */
export function parseMeta(body: string): { url?: string; tools: string[] } {
  const url = body.match(/^\s*[-*]\s*URL:\s*(\S+)/im)?.[1]?.replace(/`/g, "");
  const line = body.match(/^\s*[-*]\s*(?:Дії\s*\(tools\)|Tools):\s*(.+)$/im)?.[1];
  const tools = line
    ? line.split(",").map((s) => s.replace(/`/g, "").trim()).filter(Boolean)
    : [];
  return { url, tools };
}

export function chunkDocument(md: string): Chunk[] {
  return splitByHeadings(parseFrontmatter(md).body)
    .filter(({ heading, body }) => heading === "Intro" || body.split("\n").slice(1).join("\n").trim())
    .flatMap(({ heading, body }) => {
      const meta = parseMeta(body);
      const prefix = `## ${heading} (продовження)\n`;
      return splitBySize(body, MAX_CHARS - prefix.length).map((part, i) => ({
        heading,
        content: i === 0 ? part : prefix + part,
        ...meta,
      }));
    });
}
