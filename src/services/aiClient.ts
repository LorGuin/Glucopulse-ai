import { auth } from "./firebase";
import { trackAiResponse, trackError } from "./telemetryService";

// Único punto de entrada del frontend a la IA. Llama a nuestra función
// serverless /api/gemini (Vercel: api/gemini.ts · Netlify: netlify/functions/gemini.ts)
// mandando el ID token de Firebase, así el servidor sabe que es un usuario real.
export type GeminiAction = "meal" | "chat" | "analyze";

export async function callGemini<T = any>(action: GeminiAction, payload: Record<string, unknown>): Promise<T> {
  try {
    const data = await requestGemini<T>(action, payload);
    trackAiResponse(action, (data as any)?.proveedor);
    return data;
  } catch (err) {
    trackError(`ia_${action}`, err);
    throw err;
  }
}

async function requestGemini<T>(action: GeminiAction, payload: Record<string, unknown>): Promise<T> {
  const user = auth.currentUser;
  if (!user) throw new Error("Usuario no autenticado");
  const idToken = await user.getIdToken();

  const response = await postWithRetry("/api/gemini", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ action, ...payload }),
  });

  const raw = await response.text();
  let data: any = {};
  try {
    data = JSON.parse(raw);
  } catch {
    // La función se cayó o se cortó por tiempo: el cuerpo no es JSON.
    console.error("Respuesta no-JSON de /api/gemini:", raw.slice(0, 500));
    if (!response.ok) {
      throw new Error(`El servidor de IA no respondió bien (${response.status}). Mirá la terminal de netlify dev para ver el detalle.`);
    }
  }
  if (!response.ok) {
    if (response.status === 429) throw new Error("Se alcanzó el límite de uso de Gemini. Probá de nuevo en un rato.");
    throw new Error(data.error || `Error en el servidor (${response.status})`);
  }
  if (data?.proveedor) console.info(`[IA] ${action} respondido por ${data.proveedor}`);
  return data as T;
}

// fetch() solo lanza excepción cuando la conexión se corta (sin respuesta del
// servidor): Safari dice "Load failed", Chrome "Failed to fetch". En ese caso
// reintentamos UNA vez tras una pausa corta; si vuelve a fallar, mostramos un
// mensaje entendible. Los errores con respuesta (4xx/5xx) no se reintentan.
const NETWORK_ERROR_MSG =
  "Se cortó la conexión con el servidor. Revisá tu internet y probá de nuevo " +
  "(no cierres ni minimices la app mientras analiza).";

async function postWithRetry(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch {
    await new Promise((r) => setTimeout(r, 1500));
    try {
      return await fetch(url, init);
    } catch (err) {
      const original = (err as Error)?.message || String(err);
      throw Object.assign(new Error(NETWORK_ERROR_MSG), { code: `red: ${original}` });
    }
  }
}
