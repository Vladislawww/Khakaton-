// Minimal Gemini generateContent client with function calling (REST, no SDK).

export type Part =
  | { text: string; thoughtSignature?: string }
  | { functionCall: { name: string; args?: Record<string, unknown> }; thoughtSignature?: string }
  | { functionResponse: { name: string; response: Record<string, unknown> } };

export type Content = { role: "user" | "model"; parts: Part[] };

export type FunctionDeclaration = {
  name: string;
  description: string;
  parameters?: { type: "OBJECT"; properties: Record<string, unknown>; required?: string[] };
};

export type ModelRequest = { system: string; contents: Content[]; tools: FunctionDeclaration[] };

/** One model turn. Return the model's content exactly as received, so thought signatures round-trip. */
export type Model = (req: ModelRequest) => Promise<Content>;

const RETRIES = 2;
const MAX_WAIT = 20_000; // keep a chat reply under a minute even when throttled

/** Thrown when Gemini keeps rate-limiting us (free tier: a few requests per minute). */
export class ModelBusyError extends Error {}

export function geminiModel(opts: { apiKey: string; model: string; temperature?: number }): Model {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${opts.model}:generateContent`;
  return async ({ system, contents, tools }) => {
    const body = JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents,
      tools: [{ functionDeclarations: tools }],
      toolConfig: { functionCallingConfig: { mode: "AUTO" } },
      generationConfig: { temperature: opts.temperature ?? 0.2 },
    });
    for (let attempt = 0; ; attempt++) {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": opts.apiKey },
        body,
      });
      if ((res.status === 429 || res.status >= 500) && attempt < RETRIES) {
        // Gemini puts the pause in the body: "retryDelay": "17s"
        const hinted = Number((await res.clone().text()).match(/"retryDelay":\s*"(\d+(?:\.\d+)?)s"/)?.[1]);
        await new Promise((r) => setTimeout(r, Math.min(MAX_WAIT, hinted ? hinted * 1000 + 500 : 1500 * 2 ** attempt)));
        continue;
      }
      if (res.status === 429) throw new ModelBusyError(`Gemini rate limit: ${(await res.text()).slice(0, 300)}`);
      if (!res.ok) throw new Error(`Gemini API ${res.status}: ${(await res.text()).slice(0, 500)}`);
      const json = (await res.json()) as { candidates?: { content?: Content; finishReason?: string }[] };
      const content = json.candidates?.[0]?.content;
      if (!content?.parts?.length) {
        return { role: "model", parts: [{ text: "" }] };
      }
      return { role: "model", parts: content.parts };
    }
  };
}

export const functionCalls = (c: Content) =>
  c.parts.flatMap((p) => ("functionCall" in p ? [p.functionCall] : []));

export const textOf = (c: Content) =>
  c.parts
    .flatMap((p) => ("text" in p && !(p as { thought?: boolean }).thought ? [p.text] : []))
    .join("")
    .trim();
