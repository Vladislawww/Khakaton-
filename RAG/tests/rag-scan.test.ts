import { describe, expect, it } from "vitest";
import { scanSensitive } from "@/lib/rag/scan";

const types = (text: string) => scanSensitive(text).findings.map((f) => f.type);

describe("scanSensitive", () => {
  it("маскує ключі, паролі, картки, IBAN", () => {
    const doc = [
      "Gemini: AIzaSyA1234567890abcdefghijklmnopqrstuv",
      "OpenAI: sk-proj-abcdefghijklmnopqrstuvwxyz123456",
      "Пароль: hunter2",
      "password = qwerty123",
      "Картка 4111 1111 1111 1111",
      "IBAN UA213223130000026007233566001",
      "-----BEGIN RSA PRIVATE KEY-----\nMIIEow\n-----END RSA PRIVATE KEY-----",
    ].join("\n");
    const { text } = scanSensitive(doc);
    for (const secret of ["AIzaSy", "sk-proj", "hunter2", "qwerty123", "4111", "UA2132", "MIIEow"])
      expect(text).not.toContain(secret);
    expect(text).toContain("Пароль: [REDACTED]");
  });

  it("контакти лише знаходить, не маскує", () => {
    const { text, findings } = scanSensitive("Пишіть на support@acme.com або +380 44 123 45 67");
    expect(text).toContain("support@acme.com");
    expect(findings).toEqual([
      { type: "email", masked: false },
      { type: "phone", masked: false },
    ]);
  });

  it("не чіпає звичайний текст і дати", () => {
    expect(types("Оновлено 2026-10-31. Замовлення №48213. Ціна 299 грн.")).toEqual([]);
  });

  it("номер без перевірки Луна — не картка", () => {
    expect(scanSensitive("4111 1111 1111 1112").text).toContain("4111");
  });
});
