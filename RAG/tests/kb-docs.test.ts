import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { chunkDocument, parseFrontmatter } from "@/lib/rag/chunk";
import { scanSensitive } from "@/lib/rag/scan";

// Перевіряє справжні доки в docs/kb: щоб помилка в доці ловилась тестом, а не на демо.
const KB = path.join(__dirname, "..", "docs", "kb");
const docs = readdirSync(KB, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .flatMap((d) =>
    readdirSync(path.join(KB, d.name))
      .filter((f) => /\.(md|txt)$/i.test(f))
      .map((f) => ({ name: `${d.name}/${f}`, text: readFileSync(path.join(KB, d.name, f), "utf8") }))
  );

describe("knowledge base docs", () => {
  it("є доки", () => expect(docs.length).toBeGreaterThan(0));

  it.each(docs)("$name має явну мітку visibility", ({ text }) => {
    expect(text).toMatch(/^---\r?\n[\s\S]*?^visibility:\s*(public|internal|restricted)\s*$/m);
  });

  it.each(docs)("$name ділиться на чанки в межах ліміту", ({ text }) => {
    const chunks = chunkDocument(text);
    expect(chunks.length).toBeGreaterThan(0);
    chunks.forEach((c) => expect(c.content.length).toBeLessThanOrEqual(3000));
  });

  it.each(docs.filter((d) => parseFrontmatter(d.text).visibility === "public"))(
    "$name (public) не містить секретів",
    ({ text }) => {
      expect(scanSensitive(text).findings.filter((f) => f.masked)).toEqual([]);
    }
  );

  it("секрети з restricted-доку маскуються до індексації", () => {
    const doc = docs.find((d) => d.name.endsWith("restricted-integrations.md"))!;
    const safe = scanSensitive(doc.text).text;
    for (const secret of ["sk_test_4eC39", "whsec_demo", "Demo-Admin-2026"]) expect(safe).not.toContain(secret);
  });
});
