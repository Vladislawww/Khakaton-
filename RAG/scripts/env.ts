// Імпортується першим: підхоплює .env.local локально. У CI файлу немає — змінні йдуть із secrets.
try {
  process.loadEnvFile(".env.local");
} catch {}
