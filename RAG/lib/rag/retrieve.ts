import { db } from "./db";
import { embedQuery } from "./embed";
import { assertTenantId } from "./tenant";

export type Hit = {
  id: number;
  source: string;
  heading: string;
  content: string;
  url: string | null;
  tools: string[];
  similarity: number;
};

/**
 * Top-k public-чанків тенанта за змістом запиту. Відсікаємо нерелевантне порогом схожості.
 * tenantId має прийти з сесії/бекенду, ніколи не з тексту користувача чи відповіді LLM.
 */
export async function retrieve(tenantId: string, query: string, k = 3, minSimilarity = 0.45): Promise<Hit[]> {
  assertTenantId(tenantId);
  const { data, error } = await db().rpc("match_chunks", {
    p_tenant_id: tenantId,
    query_embedding: await embedQuery(query),
    match_count: k,
  });
  if (error) throw error;
  return (data as Hit[]).filter((h) => h.similarity >= minSimilarity);
}

const escapeAttr = (s: string) =>
  s.replace(/[&"<>]/g, (c) => ({ "&": "&amp;", '"': "&quot;", "<": "&lt;", ">": "&gt;" })[c]!);

/** Не даємо тексту дока закрити чи відкрити тег <doc> і вийти з ролі "даних". */
const escapeBody = (s: string) => s.replace(/<(\/?\s*doc\b)/gi, "&lt;$1");

/** Форматує чанки для промпту: усе всередині <doc> — ДАНІ, не інструкції. */
export function toPromptContext(hits: Hit[]): string {
  return hits
    .map(
      (h) =>
        `<doc source="${escapeAttr(h.source)}" section="${escapeAttr(h.heading)}">\n${escapeBody(h.content)}\n</doc>`
    )
    .join("\n");
}
