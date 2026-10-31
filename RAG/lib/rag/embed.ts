const MODEL = "gemini-embedding-001";
const DIM = 768; // має збігатися з vector(768) у rag.sql
const BATCH = 50;
const RETRIES = 4;

/** Входить у content_hash: зміна моделі/розмірності перевекторизує всі чанки. */
export const EMBED_VERSION = `${MODEL}@${DIM}`;

type Task = "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY";

/** POST із повтором на 429/5xx (free tier Gemini часто тротлить). */
async function post(url: string, init: RequestInit): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, init);
    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt >= RETRIES) return res;
    const wait = Number(res.headers.get("retry-after")) * 1000 || 1000 * 2 ** attempt;
    await new Promise((r) => setTimeout(r, wait));
  }
}

export async function embedMany(texts: string[], task: Task = "RETRIEVAL_DOCUMENT"): Promise<number[][]> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set");

  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += BATCH) {
    const slice = texts.slice(i, i + BATCH);
    const res = await post(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:batchEmbedContents`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          requests: slice.map((text) => ({
            model: `models/${MODEL}`,
            content: { parts: [{ text }] },
            taskType: task,
            outputDimensionality: DIM,
          })),
        }),
      }
    );
    if (!res.ok) throw new Error(`Embedding API ${res.status}: ${await res.text()}`);
    const json = (await res.json()) as { embeddings: { values: number[] }[] };
    out.push(...json.embeddings.map((e) => e.values));
  }
  return out;
}

export async function embedQuery(text: string): Promise<number[]> {
  return (await embedMany([text], "RETRIEVAL_QUERY"))[0];
}
