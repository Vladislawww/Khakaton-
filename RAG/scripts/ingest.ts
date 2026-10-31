/**
 * npm run ingest         — одноразова синхронізація docs/kb/<tenant>/ → Supabase
 * npm run ingest:watch   — стежить за папкою і оновлює RAG при кожній зміні файлу
 */
import "./env";
import { watch } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { DOC_FILE, DOCS_DIR, removeDocument, syncAll, syncDocument } from "../lib/rag/ingest";
import { isTenantId } from "../lib/rag/tenant";

const isWatch = process.argv.includes("--watch");

async function main() {
  console.log("Initial sync:", JSON.stringify(await syncAll(), null, 2));
  if (!isWatch) return;

  console.log(`Watching ${DOCS_DIR} ...`);
  const timers = new Map<string, NodeJS.Timeout>();

  watch(DOCS_DIR, { recursive: true }, (_event, filename) => {
    if (!filename || !DOC_FILE.test(filename)) return;
    const parts = filename.split(path.sep);
    if (parts.length !== 2 || !isTenantId(parts[0])) return; // лише docs/kb/<tenant>/<file>
    const [tenant, source] = parts;

    clearTimeout(timers.get(filename)); // debounce: редактори пишуть файл кількома подіями
    timers.set(
      filename,
      setTimeout(async () => {
        try {
          const text = await readFile(path.join(DOCS_DIR, filename), "utf8");
          console.log(await syncDocument(tenant, source, text));
        } catch (e: any) {
          if (e.code === "ENOENT") console.log(await removeDocument(tenant, source)); // файл видалено
          else console.error(e);
        }
      }, 500)
    );
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
