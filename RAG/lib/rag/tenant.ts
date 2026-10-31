const TENANT_ID = /^[a-z0-9][a-z0-9_-]{0,62}$/;

/** tenant_id — це також назва папки в docs/kb, тому лише безпечні символи. */
export const isTenantId = (id: unknown): id is string => typeof id === "string" && TENANT_ID.test(id);

export function assertTenantId(id: unknown): asserts id is string {
  if (!isTenantId(id)) throw new Error(`invalid tenant id: ${String(id)}`);
}
