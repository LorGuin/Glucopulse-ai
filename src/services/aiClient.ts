import { auth } from "./firebase";

// Único punto de entrada del frontend a la IA. Llama a nuestra función
// serverless /api/gemini (Vercel: api/gemini.ts · Netlify: netlify/functions/gemini.ts)
// mandando el ID token de Firebase, así el servidor sabe que es un usuario real.
export type GeminiAction = "meal" | "chat" | "analyze";

export async function callGemini<T = any>(action: GeminiAction, payload: Record<string, unknown>): Promise<T> {
  const user = auth.currentUser;
  if (!user) throw new Error("Usuario no autenticado");
  const idToken = await user.getIdToken();

  const response = await fetch("/api/gemini", {
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
