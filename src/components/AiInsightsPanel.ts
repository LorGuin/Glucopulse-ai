import type { GlucoseReading } from "../utils/glucoseAnalyzer";
import { hourlyProfile } from "../utils/glucoseSummary";
import { escapeHtml } from "../utils/escapeHtml";

// Sección "Análisis con IA" del dashboard:
//  1) Visualización local (sin IA): perfil promedio por hora del día.
//  2) Análisis de Gemini: patrones, comidas problemáticas, recomendaciones.

export interface GeminiInsights {
  resumen: string;
  puntaje: number;
  patrones: { titulo: string; detalle: string; tipo: "positivo" | "neutral" | "atencion" }[];
  comidasProblematicas?: { comida: string; motivo: string }[];
  recomendaciones: string[];
  alertas: string[];
}

export interface InsightsState {
  loading: boolean;
  error: string | null;
  data: GeminiInsights | null;
  generatedAt: Date | null;
  proveedor?: string;
}

function colorFor(value: number): string {
  if (value < 70) return "#ef4444";
  if (value <= 140) return "#10b981";
  if (value <= 180) return "#f59e0b";
  return "#ef4444";
}

function renderHourlyChart(readings: GlucoseReading[]): string {
  const profile = hourlyProfile(readings);
  if (!profile.some((p) => p.promedio !== null)) return "";

  const w = 400, h = 140, top = 10, bottom = 18;
  const minV = 40, maxV = 220;
  const barW = w / 24;
  const y = (v: number) => top + (1 - (Math.min(Math.max(v, minV), maxV) - minV) / (maxV - minV)) * (h - top - bottom);

  const bars = profile
    .map((p) => {
      if (p.promedio === null) return "";
      const x = p.hora * barW + 2;
      const yTop = y(p.promedio);
      return `<rect x="${x}" y="${yTop}" width="${barW - 4}" height="${h - bottom - yTop}" rx="2" fill="${colorFor(p.promedio)}" fill-opacity="0.85">
        <title>${String(p.hora).padStart(2, "0")}:00 — ${p.promedio} mg/dL (${p.lecturas} lecturas)</title></rect>`;
    })
    .join("");

  const labels = [0, 6, 12, 18, 23]
    .map((hr) => `<text x="${hr * barW + barW / 2}" y="${h - 4}" fill="#9aa1ac" font-size="8" text-anchor="middle">${String(hr).padStart(2, "0")}h</text>`)
    .join("");

  return `
    <div class="insights__chart">
      <span class="chart-card__subtitle">Glucosa promedio por hora del día (pasá el mouse por cada barra)</span>
      <svg viewBox="0 0 ${w} ${h}" class="chart-svg" role="img" aria-label="Perfil de glucosa por hora">
        <line x1="0" y1="${y(140)}" x2="${w}" y2="${y(140)}" stroke="#10b981" stroke-dasharray="3,3" stroke-width="0.8" opacity="0.6" />
        <line x1="0" y1="${y(70)}" x2="${w}" y2="${y(70)}" stroke="#10b981" stroke-dasharray="3,3" stroke-width="0.8" opacity="0.6" />
        ${bars}
        ${labels}
      </svg>
    </div>`;
}

function renderResult(data: GeminiInsights, generatedAt: Date | null, proveedor?: string): string {
  const tipoIcon = { positivo: "🟢", neutral: "🔵", atencion: "🟠" } as const;
  const list = (items: string[] | undefined, cls: string) =>
    items && items.length ? `<ul class="${cls}">${items.map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</ul>` : "";

  const score = Math.max(0, Math.min(100, Math.round(Number(data.puntaje) || 0)));

  return `
    <div class="insights__result">
      <div class="insights__summary">
        <div class="insights__score" style="--score-color:${score >= 70 ? "#10b981" : score >= 45 ? "#f59e0b" : "#ef4444"}">
          <strong>${score}</strong><span>estabilidad</span>
        </div>
        <p>${escapeHtml(data.resumen)}</p>
      </div>

      ${data.alertas?.length ? `<div class="insights__alerts">${list(data.alertas, "")}</div>` : ""}

      ${data.patrones?.length ? `
        <h4>Patrones detectados</h4>
        <div class="insights__patterns">
          ${data.patrones.map((p) => `
            <article class="insights__pattern insights__pattern--${escapeHtml(p.tipo)}">
              <strong>${tipoIcon[p.tipo] ?? "🔵"} ${escapeHtml(p.titulo)}</strong>
              <p>${escapeHtml(p.detalle)}</p>
            </article>`).join("")}
        </div>` : ""}

      ${data.comidasProblematicas?.length ? `
        <h4>Comidas que más te afectan</h4>
        <ul>${data.comidasProblematicas.map((c) => `<li><strong>${escapeHtml(c.comida)}:</strong> ${escapeHtml(c.motivo)}</li>`).join("")}</ul>` : ""}

      ${data.recomendaciones?.length ? `<h4>Recomendaciones</h4>${list(data.recomendaciones, "insights__recs")}` : ""}

      <p class="insights__disclaimer">
        Análisis generado por IA (${escapeHtml(proveedor || "Gemini")})${generatedAt ? ` · ${generatedAt.toLocaleString()}` : ""}. Es orientativo y no reemplaza la consulta médica.
      </p>
    </div>`;
}

export function renderInsightsSection(readings: GlucoseReading[], state: InsightsState): string {
  const hasData = readings.length > 0;
  const body = state.loading
    ? `<p class="insights__loading">🔎 Gemini está analizando tus lecturas y comidas…</p>`
    : state.error
      ? `<p class="insights__error">❌ ${escapeHtml(state.error)}</p>`
      : state.data
        ? renderResult(state.data, state.generatedAt, state.proveedor)
        : `<p class="chart-card__subtitle">Gemini revisa tus lecturas y comidas, busca patrones (horarios, picos, platos) y te da recomendaciones.</p>`;

  return `
    <section class="chart-card insights">
      <div class="chart-card__header">
        <div>
          <h3>✨ Análisis con IA</h3>
          <span class="chart-card__subtitle">${hasData ? `${readings.length} lecturas disponibles` : "Cargá lecturas para habilitar el análisis"}</span>
        </div>
        <button id="run-insights-btn" class="tab-btn active" ${!hasData || state.loading ? "disabled" : ""}>
          ${state.data ? "Volver a analizar" : "Analizar mis datos"}
        </button>
      </div>
      ${renderHourlyChart(readings)}
      ${body}
    </section>`;
}
