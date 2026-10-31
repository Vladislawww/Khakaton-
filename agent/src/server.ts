// HTTP front of the support agent. Run: npm start (reads .env.local locally, env vars on Render).
import http from "node:http";
import { pathToFileURL } from "node:url";
import { AgentError, createAgent, type Agent } from "./agent";
import { retrieve } from "../../RAG/lib/rag/retrieve";
import { geminiModel } from "./gemini";
import { supportApi } from "./support-api";

type Options = { allowedOrigin?: string; supervisorToken?: string; info?: Record<string, unknown> };

/** Stand-in used until the required secrets are set, so the service starts and explains what's missing. */
function unconfiguredAgent(missing: string[]): Agent {
  const fail = async (): Promise<never> => {
    throw new AgentError(503, "NOT_CONFIGURED", `The assistant isn't configured yet (missing ${missing.join(", ")}).`);
  };
  return { sendMessage: fail, decide: fail, decideApproval: fail, conversation: () => fail() as never, listApprovals: () => [], tickets: () => [] };
}

export function createHttpServer(agent: Agent, opts: Options = {}) {
  const origin = opts.allowedOrigin || "*";

  function send(res: http.ServerResponse, status: number, body: unknown) {
    res.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Cache-Control": "no-store",
    });
    res.end(status === 204 ? undefined : JSON.stringify(body));
  }

  async function readJson(req: http.IncomingMessage): Promise<Record<string, any>> {
    let raw = "";
    for await (const chunk of req) {
      raw += chunk;
      if (raw.length > 32 * 1024) throw new AgentError(413, "TOO_LARGE", "Request body is too large.");
    }
    if (!raw.trim()) return {};
    try {
      const v = JSON.parse(raw);
      if (v && typeof v === "object" && !Array.isArray(v)) return v;
    } catch {}
    throw new AgentError(400, "INVALID_JSON", "Body must be a JSON object.");
  }

  function requireSupervisor(req: http.IncomingMessage) {
    if (!opts.supervisorToken) return;
    if (req.headers.authorization !== `Bearer ${opts.supervisorToken}`) {
      throw new AgentError(401, "UNAUTHORIZED", "Supervisor token required.");
    }
  }

  return http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const path = url.pathname.replace(/\/+$/, "") || "/";
    try {
      if (req.method === "OPTIONS") return send(res, 204, null);
      if (req.method === "GET" && (path === "/" || path === "/api/health")) {
        return send(res, 200, { ok: true, service: "lumora-support-agent", ...opts.info });
      }

      // Parent chat. account_id stands in for a real login session in this demo.
      if (req.method === "POST" && path === "/api/chat") {
        const b = await readJson(req);
        const view = await agent.sendMessage({ conversationId: b.conversation_id, accountId: b.account_id, message: b.message, timeZone: b.time_zone });
        return send(res, 200, view);
      }
      let m = path.match(/^\/api\/chat\/([\w-]+)$/);
      if (req.method === "GET" && m) {
        return send(res, 200, agent.conversation(m[1], url.searchParams.get("account_id") ?? ""));
      }
      m = path.match(/^\/api\/chat\/([\w-]+)\/cards\/([\w-]+)$/);
      if (req.method === "POST" && m) {
        const b = await readJson(req);
        return send(res, 200, await agent.decide({ conversationId: m[1], cardId: m[2], accountId: b.account_id, decision: b.decision }));
      }

      // Support team: approvals for high-risk actions, and the hand-off queue.
      if (req.method === "GET" && path === "/api/approvals") {
        requireSupervisor(req);
        return send(res, 200, { approvals: agent.listApprovals() });
      }
      m = path.match(/^\/api\/approvals\/([\w-]+)$/);
      if (req.method === "POST" && m) {
        requireSupervisor(req);
        const b = await readJson(req);
        return send(res, 200, await agent.decideApproval({ approvalId: m[1], decision: b.decision, approver: b.approver }));
      }
      if (req.method === "GET" && path === "/api/tickets") {
        requireSupervisor(req);
        return send(res, 200, { tickets: agent.tickets() });
      }

      throw new AgentError(404, "ROUTE_NOT_FOUND", `No endpoint at ${req.method} ${path}.`);
    } catch (e) {
      if (e instanceof AgentError) return send(res, e.status, { error: { code: e.code, message: e.message } });
      console.error(e);
      return send(res, 502, { error: { code: "AGENT_ERROR", message: "The assistant is unavailable right now. Please try again." } });
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.loadEnvFile(".env.local");
  } catch {}
  const missing = ["GEMINI_API_KEY", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"].filter((name) => !process.env[name]);
  // gemini-2.5/2.0 are closed to new API keys; 3.5-flash-lite works on the free tier with tool calls.
  const model = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
  const fallbacks = (process.env.GEMINI_FALLBACK_MODELS ?? "gemini-3.8-flash").split(",").map((m) => m.trim()).filter(Boolean);
  const supportApiUrl = process.env.SUPPORT_API_URL || "https://lumora-api-lm0d.onrender.com";
  const tenantId = process.env.TENANT_ID || "lumora";

  const agent = missing.length
    ? unconfiguredAgent(missing)
    : createAgent({
        model: geminiModel({ apiKey: process.env.GEMINI_API_KEY!, model, fallbacks }),
        api: supportApi(supportApiUrl),
        retrieve: (tenant, q) => retrieve(tenant, q),
        tenantId,
      });
  if (missing.length) console.warn(`Not configured, missing: ${missing.join(", ")}. Chat returns 503 until they are set.`);
  if (!process.env.SUPERVISOR_TOKEN) console.warn("SUPERVISOR_TOKEN is not set: approval endpoints are open.");
  const port = Number(process.env.PORT) || 8787;
  createHttpServer(agent, {
    allowedOrigin: process.env.ALLOWED_ORIGIN,
    supervisorToken: process.env.SUPERVISOR_TOKEN,
    info: { configured: !missing.length, missing, model, fallbacks, tenant: tenantId, support_api: supportApiUrl },
  }).listen(port, () => console.log(`Lumora support agent listening on :${port} (model ${model})`));
}
