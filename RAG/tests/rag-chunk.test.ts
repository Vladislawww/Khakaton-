import { describe, expect, it } from "vitest";
import { chunkDocument, parseFrontmatter, parseMeta, splitBySize } from "@/lib/rag/chunk";

const DOC = `# Продукт

Вступ.

## Підписка
- URL: /settings/subscription
- Дії (tools): extend, cancel, pause
Опис підписки.

## Профіль
- URL: \`/profile\`
- Tools: reset_password
Опис профілю.
`;

describe("chunking", () => {
  it("ділить за ## і витягує метадані", () => {
    const chunks = chunkDocument(DOC);
    expect(chunks.map((c) => c.heading)).toEqual(["Intro", "Підписка", "Профіль"]);
    expect(chunks[1]).toMatchObject({ url: "/settings/subscription", tools: ["extend", "cancel", "pause"] });
    expect(chunks[2]).toMatchObject({ url: "/profile", tools: ["reset_password"] });
  });

  it("ріже завеликі секції з перекриттям і завершується", () => {
    const parts = splitBySize("слово ".repeat(2000), 3000, 300);
    expect(parts.length).toBeGreaterThan(1);
    parts.forEach((p) => expect(p.length).toBeLessThanOrEqual(3000));
  });

  it("parseMeta без метаданих повертає порожній tools", () => {
    expect(parseMeta("## X\nтекст")).toEqual({ url: undefined, tools: [] });
  });

  it("не ділить за ## всередині блоку коду", () => {
    const chunks = chunkDocument("## A\n```\n## не заголовок\n```\nтекст");
    expect(chunks.map((c) => c.heading)).toEqual(["A"]);
  });

  it("пропускає секції без тексту", () => {
    expect(chunkDocument("## Порожня\n## Друга\nтекст").map((c) => c.heading)).toEqual(["Друга"]);
  });

  it("чанки-продовження не перевищують ліміт разом із префіксом", () => {
    const chunks = chunkDocument("## Велика\n" + ("абзац тексту. ".repeat(50) + "\n\n").repeat(20));
    expect(chunks.length).toBeGreaterThan(1);
    chunks.forEach((c) => expect(c.content.length).toBeLessThanOrEqual(3000));
  });
});

describe("frontmatter", () => {
  it("читає visibility і прибирає frontmatter з тексту", () => {
    const md = "---\nvisibility: public\n---\n## Ціни\nтекст";
    expect(parseFrontmatter(md).visibility).toBe("public");
    expect(chunkDocument(md).map((c) => c.heading)).toEqual(["Ціни"]);
  });

  it("без мітки або з невідомою міткою — internal", () => {
    expect(parseFrontmatter("## X\nтекст").visibility).toBe("internal");
    expect(parseFrontmatter("---\nvisibility: everyone\n---\nтекст").visibility).toBe("internal");
  });
});
