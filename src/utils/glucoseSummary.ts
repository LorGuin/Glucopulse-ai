import type { GlucoseReading } from "./glucoseAnalyzer";
import type { MealRecord } from "../types/meal";

// Convierte miles de lecturas del sensor en un resumen compacto (unos pocos
// KB) que Gemini puede analizar rápido y barato. También alimenta el gráfico
// de perfil horario del dashboard.

export interface HourlyPoint {
  hora: number;
  promedio: number | null;
  lecturas: number;
}

interface Episode {
  inicio: string;
  duracionMin: number;
  extremo: number;
}

const round = (n: number) => Math.round(n * 10) / 10;

function localIso(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function hourlyProfile(readings: GlucoseReading[]): HourlyPoint[] {
  const buckets = Array.from({ length: 24 }, () => ({ sum: 0, n: 0 }));
  for (const r of readings) {
    const b = buckets[r.date.getHours()];
    b.sum += r.value;
    b.n++;
  }
  return buckets.map((b, hora) => ({
    hora,
    promedio: b.n ? Math.round(b.sum / b.n) : null,
    lecturas: b.n,
  }));
}

function findEpisodes(
  readings: GlucoseReading[],
  isOut: (v: number) => boolean,
  pickExtreme: (a: number, b: number) => number
): Episode[] {
  const episodes: Episode[] = [];
  let start: GlucoseReading | null = null;
  let last: GlucoseReading | null = null;
  let extreme = 0;

  const close = () => {
    if (start && last) {
      episodes.push({
        inicio: localIso(start.date),
        duracionMin: Math.max(5, Math.round((last.date.getTime() - start.date.getTime()) / 60000)),
        extremo: extreme,
      });
    }
    start = null;
  };

  for (const r of readings) {
    const gapTooBig = last && r.date.getTime() - last.date.getTime() > 20 * 60000;
    if (isOut(r.value)) {
      if (!start || gapTooBig) {
        close();
        start = r;
        extreme = r.value;
      } else {
        extreme = pickExtreme(extreme, r.value);
      }
    } else {
      close();
    }
    last = r;
  }
  close();
  return episodes;
}

export function buildDataSummary(readings: GlucoseReading[], meals: MealRecord[]) {
  const sorted = [...readings].sort((a, b) => a.date.getTime() - b.date.getTime());
  const values = sorted.map((r) => r.value);
  const n = values.length;

  const comidas = meals.slice(0, 30).map((m) => ({
    plato: m.dishName,
    hora: localIso(new Date(m.eatenAt)),
    kcal: m.macros?.calories,
    carbs_g: m.macros?.carbsGrams,
    azucar_g: m.macros?.sugarGrams,
    grasas_g: m.macros?.fatsGrams,
    proteina_g: m.macros?.proteinGrams,
    glucosa_previa: m.preMealGlucose ?? null,
    pico_2h: m.postMealPeak ?? null,
    cambio: m.glucoseDelta ?? null,
    impacto: m.glycemicImpact,
  }));

  if (n === 0) {
    return { unidad: "mg/dL", lecturas: 0, comidas };
  }

  const mean = values.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(values.reduce((a, v) => a + (v - mean) ** 2, 0) / n);
  const pct = (fn: (v: number) => boolean) => round((values.filter(fn).length / n) * 100);

  // Promedios por día (últimos 14 días con datos)
  const byDay = new Map<string, number[]>();
  for (const r of sorted) {
    const key = localIso(r.date).slice(0, 10);
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key)!.push(r.value);
  }
  const diarios = [...byDay.entries()].slice(-14).map(([fecha, vals]) => ({
    fecha,
    promedio: Math.round(vals.reduce((a, b) => a + b, 0) / vals.length),
    max: Math.max(...vals),
    min: Math.min(...vals),
  }));

  const picos = findEpisodes(sorted, (v) => v > 140, Math.max)
    .sort((a, b) => b.extremo - a.extremo)
    .slice(0, 12);
  const hipos = findEpisodes(sorted, (v) => v < 70, Math.min)
    .sort((a, b) => a.extremo - b.extremo)
    .slice(0, 12);

  return {
    unidad: "mg/dL",
    lecturas: n,
    desde: localIso(sorted[0].date),
    hasta: localIso(sorted[n - 1].date),
    estadisticas: {
      promedio: Math.round(mean),
      minimo: Math.min(...values),
      maximo: Math.max(...values),
      desvio_estandar: round(sd),
      coef_variacion_pct: round((sd / mean) * 100),
      tiempo_70_140_pct: pct((v) => v >= 70 && v <= 140),
      tiempo_70_180_pct: pct((v) => v >= 70 && v <= 180),
      tiempo_bajo_70_pct: pct((v) => v < 70),
      tiempo_sobre_180_pct: pct((v) => v > 180),
    },
    perfil_por_hora: hourlyProfile(sorted).filter((h) => h.lecturas > 0),
    promedios_diarios: diarios,
    episodios_sobre_140: picos,
    episodios_bajo_70: hipos,
    comidas,
  };
}
