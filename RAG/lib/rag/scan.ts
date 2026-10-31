export type Finding = { type: string; masked: boolean };

const REDACTED = "[REDACTED]";

/** Секрети: маскуються завжди, у базу знань не потрапляють. */
const SECRETS: { type: string; re: RegExp; keepLabel?: boolean }[] = [
  { type: "private_key", re: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g },
  {
    type: "api_key",
    re: /\b(?:sk-[A-Za-z0-9_-]{20,}|sk_(?:live|test)_[A-Za-z0-9]{16,}|sb_secret_[A-Za-z0-9_-]{16,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{35}|gh[pousr]_[A-Za-z0-9]{36,}|xox[abpr]-[A-Za-z0-9-]{10,})\b/g,
  },
  { type: "jwt", re: /\beyJ[\w-]{10,}\.[\w-]{10,}\.[\w-]{10,}\b/g },
  { type: "password", re: /(?<!\p{L})(password|passwd|pwd|пароль|api[_-]?key|secret|token)(\s*[:=]\s*)\S+/giu, keepLabel: true },
  { type: "iban", re: /\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]){11,30}\b/g },
];

/** Контакти: можуть бути легітимні (support@...), тому лише попереджаємо автора дока. */
const CONTACTS: { type: string; re: RegExp }[] = [
  { type: "email", re: /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g },
  { type: "phone", re: /(?<!\w)\+?\d[\d ()-]{8,}\d(?!\w)/g },
];

const CARD = /\b(?:\d[ -]?){12,18}\d\b/g;

function luhn(digits: string): boolean {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2) d = d * 2 > 9 ? d * 2 - 9 : d * 2;
    sum += d;
  }
  return sum % 10 === 0;
}

/**
 * Перевірка перед індексацією: маскує ключі, паролі, номери карток і IBAN,
 * знаходить email/телефони (без маскування). Можна застосувати і до відповіді бота.
 */
export function scanSensitive(text: string): { text: string; findings: Finding[] } {
  const findings: Finding[] = [];
  let out = text;

  for (const { type, re, keepLabel } of SECRETS) {
    out = out.replace(re, (...m) => {
      findings.push({ type, masked: true });
      return keepLabel ? `${m[1]}${m[2]}${REDACTED}` : REDACTED;
    });
  }

  out = out.replace(CARD, (m) => {
    const digits = m.replace(/\D/g, "");
    if (digits.length < 13 || !luhn(digits)) return m;
    findings.push({ type: "card", masked: true });
    return REDACTED;
  });

  for (const { type, re } of CONTACTS) {
    for (const [m] of out.matchAll(re)) {
      if (type === "phone" && m.replace(/\D/g, "").length < 10) continue; // дати, номери замовлень
      findings.push({ type, masked: false });
    }
  }

  return { text: out, findings };
}
