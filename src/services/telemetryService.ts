import {
  addDoc,
  collection,
  doc,
  getDoc,
  increment,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { auth, db } from "./firebase";
import { isInstalled } from "./pwaInstall";

// ---------------------------------------------------------------------------
// Monitoreo de testers
// Guarda en Firestore QUIÉN usa la app y SI LE FUNCIONA, para el panel #/admin:
//   testers/{uid}          → resumen por usuario (último uso, últimos datos del
//                            sensor, contadores, último error)
//   telemetry_events/{id}  → eventos sueltos (subida de CSV, errores, IA de
//                            respaldo, comentarios)
// Nunca se guardan valores de glucosa acá: solo fechas, cantidades y errores.
// Todo falla en silencio: el monitoreo jamás debe romper la app.
// ---------------------------------------------------------------------------

export const APP_VERSION = "0.2.0";

const OPT_OUT_KEY = "gp_telemetry_optout";
const NOTICE_KEY = "gp_telemetry_notice";
const HEARTBEAT_MS = 15 * 60 * 1000;

export type TelemetryEventType =
  | "session"
  | "csv_upload"
  | "error"
  | "ai_fallback"
  | "feedback";

function storageGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function storageSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* modo privado: no pasa nada */
  }
}

function enabled(): boolean {
  // No se envía nada hasta que el usuario vio el aviso, ni si eligió no enviar.
  return Boolean(auth.currentUser) && storageGet(NOTICE_KEY) === "1" && storageGet(OPT_OUT_KEY) !== "1";
}

function shortDevice(): string {
  const ua = navigator.userAgent;
  const os = /Android/i.test(ua) ? "Android" : /iPhone|iPad/i.test(ua) ? "iOS" : /Windows/i.test(ua) ? "Windows" : /Mac/i.test(ua) ? "Mac" : "Otro";
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Otro";
  const mobile = /Mobi/i.test(ua) ? "celular" : "compu";
  return `${os} · ${browser} · ${mobile}${isInstalled() ? " · app instalada" : ""}`;
}

function errorInfo(err: unknown): { message: string; code?: string } {
  const e = err as { message?: string; code?: string } | undefined;
  return {
    message: String(e?.message ?? err ?? "Error desconocido").slice(0, 300),
    ...(e?.code ? { code: String(e.code) } : {}),
  };
}

// Actualiza el resumen del usuario. Con merge, los objetos anidados (counters)
// se combinan campo por campo y nunca se pisan otros datos.
async function updateTester(data: Record<string, unknown>): Promise<void> {
  if (!enabled()) return;
  const user = auth.currentUser!;
  try {
    await setDoc(
      doc(db, "testers", user.uid),
      { email: user.email ?? "", lastSeen: serverTimestamp(), appVersion: APP_VERSION, ...data },
      { merge: true }
    );
  } catch (err) {
    console.warn("[monitoreo] no se pudo actualizar el resumen:", err);
  }
}

async function logEvent(type: TelemetryEventType, detail: Record<string, unknown> = {}): Promise<void> {
  if (!enabled()) return;
  const user = auth.currentUser!;
  try {
    await addDoc(collection(db, "telemetry_events"), {
      uid: user.uid,
      email: user.email ?? "",
      type,
      detail,
      appVersion: APP_VERSION,
      at: serverTimestamp(),
    });
  } catch (err) {
    console.warn("[monitoreo] no se pudo registrar el evento:", err);
  }
}

// ---------------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------------

let heartbeatTimer: number | undefined;
let globalHandlersInstalled = false;
let pendingSensorData: { lastReadingAt: Date | null; totalReadings: number } | null = null;

/** Llamar cuando el usuario inicia sesión / abre la app logueado. */
export async function startTelemetrySession(): Promise<void> {
  if (!auth.currentUser) return;

  installGlobalErrorHandlers();
  await showNoticeOnce();
  if (!enabled()) return;

  // firstSeen solo se escribe la primera vez
  try {
    const snap = await getDoc(doc(db, "testers", auth.currentUser.uid));
    const firstTime = !snap.exists();
    await updateTester({
      device: shortDevice(),
      counters: { sessions: increment(1) },
      ...(firstTime ? { firstSeen: serverTimestamp() } : {}),
    });
  } catch {
    await updateTester({ device: shortDevice(), counters: { sessions: increment(1) } });
  }

  if (pendingSensorData) reportSensorData(pendingSensorData.lastReadingAt, pendingSensorData.totalReadings);

  window.clearInterval(heartbeatTimer);
  heartbeatTimer = window.setInterval(() => {
    if (document.visibilityState === "visible") updateTester({});
  }, HEARTBEAT_MS);
}

export function stopTelemetrySession(): void {
  window.clearInterval(heartbeatTimer);
}

/** Lecturas del sensor cargadas (desde la nube o desde un CSV recién subido). */
export function reportSensorData(lastReadingAt: Date | null, totalReadings: number): void {
  // Si todavía no aceptó el aviso (primera vez), lo guardamos y se envía después.
  if (!enabled()) {
    pendingSensorData = { lastReadingAt, totalReadings };
    return;
  }
  pendingSensorData = null;
  if (!lastReadingAt) {
    updateTester({ totalReadings: 0 });
    return;
  }
  updateTester({ lastReadingAt, totalReadings });
}

/** El usuario subió un CSV del sensor. */
export function trackCsvUpload(info: { readings: number; days: number; from: Date; to: Date; ok: boolean }): void {
  updateTester({
    lastCsvUploadAt: serverTimestamp(),
    counters: { csvUploads: increment(1) },
  });
  logEvent("csv_upload", {
    readings: info.readings,
    days: info.days,
    from: info.from.toISOString(),
    to: info.to.toISOString(),
    ok: info.ok,
  });
}

/** Algo falló. `area` dice dónde: "csv", "ia_meal", "ia_chat", "carga_lecturas", etc. */
export function trackError(area: string, err: unknown): void {
  // Guardamos el dispositivo EN el error: el resumen del tester solo muestra
  // el último dispositivo usado, que puede no ser donde falló.
  const info = { ...errorInfo(err), device: shortDevice() };
  updateTester({
    lastError: { area, ...info, at: new Date() },
    counters: { errors: increment(1) },
  });
  logEvent("error", { area, ...info });
}

/** Respuesta de la IA: cuenta el uso y detecta cuando Gemini falló y respondió Groq. */
export function trackAiResponse(action: string, proveedor: string | undefined): void {
  const usedFallback = Boolean(proveedor?.startsWith("groq"));
  updateTester({
    lastAiAt: serverTimestamp(),
    lastAiProvider: proveedor ?? "desconocido",
    counters: usedFallback
      ? { aiCalls: increment(1), aiFallbacks: increment(1) }
      : { aiCalls: increment(1) },
  });
  if (usedFallback) logEvent("ai_fallback", { action, proveedor });
}

/** Comentario del tester (👍 / 👎 + texto opcional). */
export async function sendFeedback(ok: boolean, comment: string): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error("Usuario no autenticado");
  // El comentario se envía aunque el usuario haya desactivado el monitoreo:
  // lo está mandando él a propósito.
  await addDoc(collection(db, "telemetry_events"), {
    uid: user.uid,
    email: user.email ?? "",
    type: "feedback",
    detail: { ok, comment: comment.slice(0, 1000) },
    appVersion: APP_VERSION,
    at: serverTimestamp(),
  });
  await setDoc(
    doc(db, "testers", user.uid),
    { email: user.email ?? "", lastFeedback: { ok, comment: comment.slice(0, 200), at: new Date() } },
    { merge: true }
  ).catch(() => {});
}

// ---------------------------------------------------------------------------
// Errores no capturados + aviso de privacidad
// ---------------------------------------------------------------------------

function installGlobalErrorHandlers(): void {
  if (globalHandlersInstalled) return;
  globalHandlersInstalled = true;
  let sentThisMinute = 0;
  window.setInterval(() => (sentThisMinute = 0), 60_000);

  const report = (area: string, err: unknown) => {
    if (sentThisMinute++ >= 5) return; // evita inundar Firestore si algo entra en bucle
    trackError(area, err);
  };
  window.addEventListener("error", (e) => report("app", e.error ?? e.message));
  window.addEventListener("unhandledrejection", (e) => report("app_promesa", e.reason));
}

function showNoticeOnce(): Promise<void> {
  if (storageGet(NOTICE_KEY)) return Promise.resolve();
  if (document.querySelector(".telemetry-notice")) return Promise.resolve();
  return new Promise((resolve) => {

  const box = document.createElement("div");
  box.className = "telemetry-notice";
  box.setAttribute("role", "dialog");
  box.innerHTML = `
    <strong>Versión de prueba de GlucoPulse AI</strong>
    <p>Para saber si la app te funciona bien, registramos datos de uso: cuándo la abrís,
    cuándo subís el archivo del sensor, la fecha de tu última lectura y los errores que aparezcan.
    <b>No se envían tus valores de glucosa a este monitoreo.</b></p>
    <p class="telemetry-notice__small">Esta app es una versión de prueba y no reemplaza al lector oficial de tu sensor ni la indicación de tu médico.</p>
    <div class="telemetry-notice__actions">
      <button type="button" data-a="no" class="telemetry-notice__btn telemetry-notice__btn--ghost">No enviar datos de uso</button>
      <button type="button" data-a="ok" class="telemetry-notice__btn">Entendido</button>
    </div>
  `;
  box.addEventListener("click", (e) => {
    const action = (e.target as HTMLElement).dataset?.a;
    if (!action) return;
    storageSet(NOTICE_KEY, "1");
    if (action === "no") {
      storageSet(OPT_OUT_KEY, "1");
      stopTelemetrySession();
    }
    box.remove();
    resolve();
  });
  document.body.appendChild(box);
  });
}
