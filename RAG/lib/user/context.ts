import { scanSensitive } from "../rag/scan";
import { assertTenantId } from "../rag/tenant";

/** Хто пише. Береться з авторизації на бекенді, ніколи з тексту користувача чи відповіді LLM. */
export type Session = { tenantId: string; userId: string };

/** Лише те, що боту потрібно знати. Без номерів карток, паролів, токенів. */
export type Account = {
  name: string;
  email: string;
  plan?: { name: string; status: "active" | "paused" | "cancelled" | "past_due"; renewsAt?: string };
  payments?: { date: string; amount: number; currency: string; status: "paid" | "failed" | "refunded" }[];
  upcoming?: { date: string; title: string }[];
};

/** Дані акаунта. Реалізує той, хто володіє таблицями користувачів (mock DB). */
export interface AccountProvider {
  getAccount(session: Session): Promise<Account | null>;
}

export type MemoryNote = { text: string; at: string };

/** Нотатки бота про користувача ("віддає перевагу email", "мав проблему з оплатою"). */
export interface MemoryStore {
  list(session: Session, limit: number): Promise<MemoryNote[]>;
  add(session: Session, note: MemoryNote): Promise<void>;
}

const MAX_NOTE = 300;
const MAX_NOTES = 20;
const SHOWN_NOTES = 5;
const SHOWN_PAYMENTS = 3;

const USER_ID = /^[\w-]{1,64}$/;

function assertSession(s: Session) {
  assertTenantId(s.tenantId);
  if (!USER_ID.test(s.userId)) throw new Error(`invalid user id: ${s.userId}`);
}

const key = (s: Session) => `${s.tenantId}:${s.userId}`;

/** Пам'ять у процесі — для демо й тестів. Потім замінити на таблицю з (tenant_id, user_id). */
export function inMemoryStore(): MemoryStore {
  const notes = new Map<string, MemoryNote[]>();
  return {
    async list(s, limit) {
      return (notes.get(key(s)) ?? []).slice(-limit);
    },
    async add(s, note) {
      notes.set(key(s), [...(notes.get(key(s)) ?? []), note].slice(-MAX_NOTES));
    },
  };
}

/** Зберігає нотатку: обрізає довжину і маскує секрети, щоб бот не "запам'ятав" пароль. */
export async function remember(store: MemoryStore, session: Session, text: string) {
  assertSession(session);
  const clean = scanSensitive(text.trim().slice(0, MAX_NOTE)).text;
  if (clean) await store.add(session, { text: clean, at: new Date().toISOString() });
}

/** Не даємо даним користувача закрити тег і вийти з ролі "даних". */
const escape = (s: string) => s.replace(/</g, "&lt;");

/**
 * Блок для промпту з даними лише цього користувача цього тенанта.
 * Усе всередині <user_context> — ДАНІ, не інструкції.
 */
export async function buildUserContext(
  session: Session,
  deps: { accounts: AccountProvider; memory: MemoryStore }
): Promise<string> {
  assertSession(session);
  const [account, notes] = await Promise.all([
    deps.accounts.getAccount(session),
    deps.memory.list(session, SHOWN_NOTES),
  ]);

  const data = {
    account: account && {
      name: account.name,
      email: account.email,
      plan: account.plan ?? null,
      recentPayments: (account.payments ?? []).slice(0, SHOWN_PAYMENTS),
      upcoming: account.upcoming ?? [],
    },
    memory: notes.map((n) => `${n.at.slice(0, 10)}: ${n.text}`),
  };
  return `<user_context>\n${escape(JSON.stringify(data, null, 2))}\n</user_context>`;
}
