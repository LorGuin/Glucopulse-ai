import { collection, getDocs, orderBy, query, Timestamp, where, limit } from "firebase/firestore";
import { auth, db } from "../services/firebase";
import { escapeHtml } from "../utils/escapeHtml";

// Panel de monitoreo de testers (#/admin). Solo lo ven los mails de
// VITE_ADMIN_EMAILS, y además las reglas de Firestore bloquean la lectura a
// cualquier otro usuario (ver firestore.rules).

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

type Estado = "verde" | "amarillo" | "rojo";

interface TesterRow {
  uid: string;
  email: string;
  device?: string;
  appVersion?: string;
  firstSeen?: Date;
  lastSeen?: Date;
  lastReadingAt?: Date;
  lastCsvUploadAt?: Date;
  lastAiAt?: Date;
  lastAiProvider?: string;
  totalReadings?: number;
  counters: { sessions?: number; csvUploads?: number; aiCalls?: number; aiFallbacks?: number; errors?: number };
  lastError?: { area?: string; message?: string; at?: Date };
  lastFeedback?: { ok?: boolean; comment?: string; at?: Date };
  errors24h: number;
  estado: Estado;
  motivos: string[];
}

interface EventRow {
  uid: string;
  email: string;
  type: string;
  detail: Record<string, any>;
  at?: Date;
}

export function isAdminEmail(email: string | null | undefined): boolean {
  const list = String(import.meta.env.VITE_ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return Boolean(email) && list.includes(email!.toLowerCase());
}

function toDate(v: unknown): Date | undefined {
  if (v instanceof Timestamp) return v.toDate();
  if (v instanceof Date) return v;
  if (typeof v === "string" || typeof v === "number") {
    const d = new Date(v);
    return isNaN(d.getTime()) ? undefined : d;
  }
  return undefined;
}

function hace(d?: Date): string {
  if (!d) return '<span class="admin-muted">nunca</span>';
  const min = Math.round((Date.now() - d.getTime()) / 60000);
  let txt: string;
  if (min < 1) txt = "recién";
  else if (min < 60) txt = `hace ${min} min`;
  else if (min < 48 * 60) txt = `hace ${Math.round(min / 60)} h`;
  else txt = `hace ${Math.round(min / 1440)} días`;
  return `<span title="${d.toLocaleString("es-AR", { hour12: false })}">${txt}</span>`;
}

function calcularEstado(t: Omit<TesterRow, "estado" | "motivos">): { estado: Estado; motivos: string[] } {
  const now = Date.now();
  const rojo: string[] = [];
  const amarillo: string[] = [];

  if (!t.lastReadingAt) rojo.push("nunca cargó datos del sensor");
  else if (now - t.lastReadingAt.getTime() > 3 * DAY) amarillo.push("última lectura del sensor de hace más de 3 días");

  if (!t.lastSeen || now - t.lastSeen.getTime() > 7 * DAY) rojo.push("no abre la app hace más de 7 días");
  else if (now - t.lastSeen.getTime() > 3 * DAY) amarillo.push("no abre la app hace más de 3 días");

  if (t.errors24h >= 3) rojo.push(`${t.errors24h} errores en 24 h`);
  else if (t.errors24h > 0) amarillo.push(`${t.errors24h} error(es) en 24 h`);

  if (t.lastFeedback && t.lastFeedback.ok === false) amarillo.push("reportó un problema");

  if (rojo.length) return { estado: "rojo", motivos: [...rojo, ...amarillo] };
  if (amarillo.length) return { estado: "amarillo", motivos: amarillo };
  return { estado: "verde", motivos: ["todo en orden"] };
}

async function cargarDatos(): Promise<{ testers: TesterRow[]; events: EventRow[] }> {
  const since = Timestamp.fromMillis(Date.now() - 7 * DAY);
  const [testersSnap, eventsSnap] = await Promise.all([
    getDocs(collection(db, "testers")),
    getDocs(query(collection(db, "telemetry_events"), where("at", ">=", since), orderBy("at", "desc"), limit(500))),
  ]);

  const events: EventRow[] = eventsSnap.docs.map((d) => {
    const x = d.data();
    return { uid: x.uid, email: x.email ?? "", type: x.type, detail: x.detail ?? {}, at: toDate(x.at) };
  });

  const testers = testersSnap.docs.map((d) => {
    const x = d.data();
    const errors24h = events.filter(
      (e) => e.uid === d.id && e.type === "error" && e.at && Date.now() - e.at.getTime() < DAY
    ).length;
    const base = {
      uid: d.id,
      email: x.email ?? "(sin mail)",
      device: x.device,
      appVersion: x.appVersion,
      firstSeen: toDate(x.firstSeen),
      lastSeen: toDate(x.lastSeen),
      lastReadingAt: toDate(x.lastReadingAt),
      lastCsvUploadAt: toDate(x.lastCsvUploadAt),
      lastAiAt: toDate(x.lastAiAt),
      lastAiProvider: x.lastAiProvider,
      totalReadings: x.totalReadings,
      counters: x.counters ?? {},
      lastError: x.lastError ? { ...x.lastError, at: toDate(x.lastError.at) } : undefined,
      lastFeedback: x.lastFeedback ? { ...x.lastFeedback, at: toDate(x.lastFeedback.at) } : undefined,
      errors24h,
    };
    return { ...base, ...calcularEstado(base) };
  });

  const orden: Record<Estado, number> = { rojo: 0, amarillo: 1, verde: 2 };
  testers.sort((a, b) => orden[a.estado] - orden[b.estado] || (b.lastSeen?.getTime() ?? 0) - (a.lastSeen?.getTime() ?? 0));
  return { testers, events };
}

function renderTesters(testers: TesterRow[]): string {
  if (testers.length === 0) {
    return `<p class="admin-muted admin-pad">Todavía nadie abrió la app con esta versión. Cuando un tester inicie sesión, aparece acá.</p>`;
  }
  return testers
    .map((t) => {
      const c = t.counters;
      return `
      <article class="admin-tester admin-tester--${t.estado}">
        <header class="admin-tester__head">
          <span class="admin-dot admin-dot--${t.estado}"></span>
          <strong class="admin-tester__email">${escapeHtml(t.email)}</strong>
          <span class="admin-muted">${escapeHtml(t.device ?? "")} · v${escapeHtml(t.appVersion ?? "?")}</span>
        </header>
        <p class="admin-tester__motivos">${t.motivos.map(escapeHtml).join(" · ")}</p>
        <dl class="admin-tester__grid">
          <div><dt>Último uso</dt><dd>${hace(t.lastSeen)}</dd></div>
          <div><dt>Última lectura del sensor</dt><dd>${hace(t.lastReadingAt)}${t.totalReadings ? ` <span class="admin-muted">(${t.totalReadings} lecturas)</span>` : ""}</dd></div>
          <div><dt>Último CSV subido</dt><dd>${hace(t.lastCsvUploadAt)}</dd></div>
          <div><dt>Última consulta a la IA</dt><dd>${hace(t.lastAiAt)}${t.lastAiProvider ? ` <span class="admin-muted">(${escapeHtml(t.lastAiProvider)})</span>` : ""}</dd></div>
          <div><dt>Uso total</dt><dd>${c.sessions ?? 0} sesiones · ${c.csvUploads ?? 0} CSV · ${c.aiCalls ?? 0} IA${c.aiFallbacks ? ` (${c.aiFallbacks} por Groq)` : ""}</dd></div>
          <div><dt>Errores</dt><dd>${t.errors24h} en 24 h · ${c.errors ?? 0} en total</dd></div>
          <div><dt>Primera vez</dt><dd>${hace(t.firstSeen)}</dd></div>
        </dl>
        ${t.lastError ? `<p class="admin-error">Último error (${escapeHtml(t.lastError.area ?? "")}, ${hace(t.lastError.at)}): ${escapeHtml(t.lastError.message ?? "")}</p>` : ""}
        ${t.lastFeedback ? `<p class="admin-feedback">${t.lastFeedback.ok ? "👍" : "👎"} ${escapeHtml(t.lastFeedback.comment || "(sin comentario)")} <span class="admin-muted">${hace(t.lastFeedback.at)}</span></p>` : ""}
      </article>`;
    })
    .join("");
}

const eventLabel: Record<string, string> = {
  error: "❌ Error",
  feedback: "💬 Comentario",
  csv_upload: "📊 Subió CSV",
  ai_fallback: "🔁 IA por Groq",
};

function describeEvent(e: EventRow): string {
  const d = e.detail;
  switch (e.type) {
    case "error":
      return `${escapeHtml(d.area ?? "")}: ${escapeHtml(d.message ?? "")}`;
    case "feedback":
      return `${d.ok ? "👍" : "👎"} ${escapeHtml(d.comment || "(sin comentario)")}`;
    case "csv_upload":
      return `${d.readings ?? "?"} lecturas, ${d.days ?? "?"} días${d.ok === false ? " — <b>no se pudo guardar</b>" : ""}`;
    case "ai_fallback":
      return `Gemini falló en "${escapeHtml(d.action ?? "")}", respondió ${escapeHtml(d.proveedor ?? "")}`;
    default:
      return escapeHtml(JSON.stringify(d));
  }
}

function renderEvents(events: EventRow[], filtro: string): string {
  const list = events.filter((e) => (filtro === "todos" ? e.type in eventLabel : e.type === filtro)).slice(0, 100);
  if (list.length === 0) return `<p class="admin-muted admin-pad">Nada en los últimos 7 días.</p>`;
  return `<ul class="admin-events">${list
    .map(
      (e) => `<li>
        <span class="admin-events__type admin-events__type--${e.type}">${eventLabel[e.type] ?? e.type}</span>
        <span class="admin-events__who">${escapeHtml(e.email)}</span>
        <span class="admin-events__what">${describeEvent(e)}</span>
        <span class="admin-muted">${hace(e.at)}</span>
      </li>`
    )
    .join("")}</ul>`;
}

export function initAdmin(params?: { goTo: (path: string) => void }): HTMLElement {
  const container = document.createElement("div");
  container.className = "admin-container";

  // El asistente flotante no tiene sentido en el panel de administración.
  document.getElementById("ai-chat-root")?.remove();

  let testers: TesterRow[] = [];
  let events: EventRow[] = [];
  let filtro = "todos";
  let estado = "Cargando…";
  let refreshTimer: number | undefined;

  const render = () => {
    const count = (s: Estado) => testers.filter((t) => t.estado === s).length;
    container.innerHTML = `
      <div class="admin-wrapper">
        <header class="admin-header">
          <div>
            <h1>Monitoreo de testers</h1>
            <p class="admin-muted">${escapeHtml(estado)}</p>
          </div>
          <div class="admin-header__actions">
            <button type="button" class="admin-btn" id="admin-refresh">↻ Actualizar</button>
            <button type="button" class="admin-btn admin-btn--ghost" id="admin-back">← Volver a la app</button>
          </div>
        </header>

        <section class="admin-kpis">
          <div class="admin-kpi"><b>${testers.length}</b><span>Testers</span></div>
          <div class="admin-kpi"><b>${count("verde")}</b><span>🟢 Funcionando</span></div>
          <div class="admin-kpi"><b>${count("amarillo")}</b><span>🟡 A revisar</span></div>
          <div class="admin-kpi"><b>${count("rojo")}</b><span>🔴 Sin datos / con fallas</span></div>
        </section>

        <section class="admin-section">
          <h2>Testers</h2>
          ${renderTesters(testers)}
        </section>

        <section class="admin-section">
          <div class="admin-section__head">
            <h2>Actividad de los últimos 7 días</h2>
            <div class="period-tabs">
              ${["todos", "error", "feedback", "csv_upload", "ai_fallback"]
                .map((f) => `<button class="tab-btn ${filtro === f ? "active" : ""}" data-filtro="${f}">${f === "todos" ? "Todo" : eventLabel[f]}</button>`)
                .join("")}
            </div>
          </div>
          ${renderEvents(events, filtro)}
        </section>
      </div>
    `;

    container.querySelector("#admin-refresh")?.addEventListener("click", load);
    container.querySelector("#admin-back")?.addEventListener("click", () => {
      window.clearInterval(refreshTimer);
      params?.goTo("/principal");
    });
    container.querySelectorAll<HTMLButtonElement>("[data-filtro]").forEach((b) =>
      b.addEventListener("click", () => {
        filtro = b.dataset.filtro || "todos";
        render();
      })
    );
  };

  const load = async () => {
    estado = "Cargando…";
    render();
    try {
      ({ testers, events } = await cargarDatos());
      estado = `Actualizado ${new Date().toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false })} · se actualiza solo cada 2 minutos`;
    } catch (err: any) {
      console.error("[admin]", err);
      estado =
        err?.code === "permission-denied"
          ? "Firestore no te deja leer los datos: falta pegar las reglas de firestore.rules en la consola de Firebase (o tu mail no está como administrador)."
          : `Error al cargar: ${err?.message || err}`;
    }
    render();
  };

  if (!isAdminEmail(auth.currentUser?.email)) {
    container.innerHTML = `
      <div class="admin-wrapper">
        <h1>Acceso restringido</h1>
        <p class="admin-muted">Esta sección es solo para el administrador de GlucoPulse.</p>
        <button type="button" class="admin-btn" id="admin-back">← Volver a la app</button>
      </div>`;
    container.querySelector("#admin-back")?.addEventListener("click", () => params?.goTo("/principal"));
    return container;
  }

  load();
  refreshTimer = window.setInterval(() => {
    if (!container.isConnected) {
      window.clearInterval(refreshTimer);
      return;
    }
    if (document.visibilityState === "visible") load();
  }, 2 * 60 * 1000);

  return container;
}
