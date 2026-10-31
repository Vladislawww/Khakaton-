import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { chunkDocument, parseFrontmatter } from "./chunk";
import { EMBED_VERSION, embedMany } from "./embed";
import { scanSensitive } from "./scan";
import { assertTenantId, isTenantId } from "./tenant";

/** Структура: docs/kb/<tenant_id>/<doc>.md */
export const DOCS_DIR = process.env.DOCS_DIR ?? "docs/kb";
export const DOC_FILE = /\.(md|txt)$/i;

// Service role: лише на сервері, ніколи не в клієнтському коді.
const db = () =>
  createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const PAGE = 1000; // ліміт рядків Supabase на один select

/**
 * Синхронізує один документ тенанта з БД. Інкрементально:
 * незмінені чанки (за hash) не чіпаємо і не перераховуємо embeddings,
 * нові — векторизуємо й додаємо, і лише потім видаляємо застарілі
 * (якщо embedding впаде, у базі лишиться стара версія дока, а не нічого).
 */
export async function syncDocument(tenantId: string, source: string, markdown: string) {
  assertTenantId(tenantId);
  const supabase = db();
  const { visibility } = parseFrontmatter(markdown);
  const { text: safe, findings } = scanSensitive(markdown);
  const chunks = chunkDocument(safe).map((c) => ({
    ...c,
    hash: sha(`${EMBED_VERSION}\n${visibility}\n${c.content}`),
  }));

  const { data: existing, error } = await supabase
    .from("doc_chunks")
    .select("id, content_hash")
    .eq("tenant_id", tenantId)
    .eq("source", source);
  if (error) throw error;

  const wanted = new Set(chunks.map((c) => c.hash));
  const have = new Set((existing ?? []).map((r) => r.content_hash));

  const staleIds = (existing ?? []).filter((r) => !wanted.has(r.content_hash)).map((r) => r.id);
  const fresh = chunks.filter((c, i, arr) => !have.has(c.hash) && arr.findIndex((x) => x.hash === c.hash) === i);

  if (fresh.length) {
    const vectors = await embedMany(fresh.map((c) => `${c.heading}\n${c.content}`));
    const rows = fresh.map((c, i) => ({
      tenant_id: tenantId,
      source,
      visibility,
      heading: c.heading,
      content: c.content,
      content_hash: c.hash,
      url: c.url ?? null,
      tools: c.tools,
      embedding: vectors[i] as unknown as string, // pgvector приймає масив
    }));
    const { error: e } = await supabase.from("doc_chunks").insert(rows);
    if (e) throw e;
  }

  if (staleIds.length) {
    const { error: e } = await supabase.from("doc_chunks").delete().in("id", staleIds);
    if (e) throw e;
  }

  if (findings.length)
    console.warn(`[rag] ${tenantId}/${source}: sensitive data`, findings.map((f) => `${f.type}${f.masked ? " (masked)" : ""}`).join(", "));

  return {
    tenantId,
    source,
    visibility,
    added: fresh.length,
    removed: staleIds.length,
    unchanged: chunks.length - fresh.length,
    sensitive: findings,
  };
}

export async function removeDocument(tenantId: string, source: string) {
  assertTenantId(tenantId);
  const { error } = await db().from("doc_chunks").delete().eq("tenant_id", tenantId).eq("source", source);
  if (error) throw error;
  return { tenantId, source, removed: true };
}

/** Усі пари tenant/source у БД (з пагінацією, бо select віддає максимум 1000 рядків). */
async function listIndexed(): Promise<Set<string>> {
  const supabase = db();
  const seen = new Set<string>();
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("doc_chunks")
      .select("tenant_id, source")
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) throw error;
    for (const r of data ?? []) seen.add(`${r.tenant_id}/${r.source}`);
    if ((data ?? []).length < PAGE) return seen;
  }
}

/** Синхронізує всю папку docs/kb/<tenant>/: нові/змінені файли оновлює, зниклі — прибирає з БД. */
export async function syncAll(dir = DOCS_DIR) {
  const tenants = (await readdir(dir, { withFileTypes: true }))
    .filter((d) => d.isDirectory() && isTenantId(d.name))
    .map((d) => d.name);

  const results = [];
  const onDisk = new Set<string>();
  for (const tenant of tenants) {
    const files = (await readdir(path.join(dir, tenant))).filter((f) => DOC_FILE.test(f));
    for (const f of files) {
      onDisk.add(`${tenant}/${f}`);
      results.push(await syncDocument(tenant, f, await readFile(path.join(dir, tenant, f), "utf8")));
    }
  }

  for (const key of await listIndexed()) {
    if (onDisk.has(key)) continue;
    const [tenant, source] = [key.slice(0, key.indexOf("/")), key.slice(key.indexOf("/") + 1)];
    results.push(await removeDocument(tenant, source));
  }
  return results;
}
