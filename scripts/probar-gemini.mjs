// Prueba qué modelos de Gemini responden con TU clave y cuánto tardan.
// Uso:  node scripts/probar-gemini.mjs
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()])
);
const key = env.GEMINI_API_KEY;
if (!key) {
  console.log("Falta GEMINI_API_KEY en .env");
  process.exit(1);
}

const modelos = [
  env.GEMINI_MODEL,
  "gemini-flash-latest",
  "gemini-flash-lite-latest",
  "gemini-3.8-flash",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
].filter((m, i, a) => m && a.indexOf(m) === i);

for (const modelo of modelos) {
  const t0 = Date.now();
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({ contents: [{ parts: [{ text: "Respondé solo: ok" }] }] }),
        signal: AbortSignal.timeout(20000),
      }
    );
    const data = await res.json().catch(() => ({}));
    const ms = Date.now() - t0;
    if (res.ok) console.log(`✅ ${modelo.padEnd(26)} ${ms} ms`);
    else console.log(`❌ ${modelo.padEnd(26)} ${res.status} ${data?.error?.message?.slice(0, 90) ?? ""}`);
  } catch (e) {
    console.log(`❌ ${modelo.padEnd(26)} ${e.name === "TimeoutError" ? "no respondió en 20 s" : e.message}`);
  }
}
