// Client for the mock support-tool REST API (../support-api). Every call returns the API envelope as-is.

export type Envelope<T = any> = { ok: boolean; data: T | null; error: { code: string; message: string } | null };

export type SupportApi = ReturnType<typeof supportApi>;

export function supportApi(baseUrl: string) {
  const base = baseUrl.replace(/\/$/, "");
  async function call<T = any>(method: "GET" | "POST", path: string, caller: string, body?: unknown): Promise<Envelope<T>> {
    try {
      const res = await fetch(base + path, {
        method,
        headers: { "Content-Type": "application/json", "X-Caller": caller },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return (await res.json()) as Envelope<T>;
    } catch (e) {
      return { ok: false, data: null, error: { code: "SUPPORT_API_UNREACHABLE", message: String(e) } };
    }
  }
  const q = (params: Record<string, unknown>) => {
    const s = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== "") as [string, string][]
    ).toString();
    return s ? `?${s}` : "";
  };
  const id = encodeURIComponent;

  return {
    getAccount: (accountId: string, caller: string) => call("GET", `/api/accounts/${id(accountId)}`, caller),
    getLessons: (accountId: string, filters: Record<string, unknown>, caller: string) =>
      call("GET", `/api/accounts/${id(accountId)}/lessons${q(filters)}`, caller),
    listTutors: (subject: string | undefined, caller: string) => call("GET", `/api/tutors${q({ subject })}`, caller),
    verify: (accountId: string, body: { email: string; child_name: string }, caller: string) =>
      call("POST", `/api/accounts/${id(accountId)}/verify`, caller, body),
    reschedule: (lessonId: string, body: { new_start: string; reason: string }, caller: string) =>
      call("POST", `/api/lessons/${id(lessonId)}/reschedule`, caller, body),
    assignTutor: (accountId: string, body: { child_id: string; new_tutor_id: string; reason: string }, caller: string) =>
      call("POST", `/api/accounts/${id(accountId)}/assign_tutor`, caller, body),
    cancelSubscription: (
      accountId: string,
      body: { reason: string; effective: "end_of_period" | "immediately"; approved_by: string | null },
      caller: string
    ) => call("POST", `/api/accounts/${id(accountId)}/subscription/cancel`, caller, body),
    health: () => call("GET", "/api/health", "agent"),
  };
}
