import type { GlucoseReading } from "./glucoseAnalyzer";
import type { MacroNutrients } from "../types/meal";

export interface CorrelationResult {
  preMealGlucose: number | null;
  postMealPeak: number | null;
  delta: number | null;
  causedSpike: boolean;
  impactLevel: 'low' | 'medium' | 'high';
  adviceNextMeal: string;
}

const MIN = 60 * 1000;

export function correlateMealWithGlucose(
  mealTime: Date,
  cgmData: GlucoseReading[],
  macros: MacroNutrients,
  dishName: string
): CorrelationResult {
  const t = mealTime.getTime();

  // Glucosa previa = la última lectura en los 30 min ANTES de comer
  // (antes se tomaba la primera lectura posterior, que ya puede estar subiendo).
  const before = cgmData.filter((r) => r.date.getTime() <= t && r.date.getTime() >= t - 30 * MIN);
  const after = cgmData.filter((r) => r.date.getTime() > t && r.date.getTime() <= t + 120 * MIN);

  // Sin lecturas alrededor de la comida: NO inventamos valores (antes se
  // guardaba 100 mg/dL como si fuera real). Se clasifica solo por macros.
  if (before.length === 0 || after.length === 0) {
    const highByMacros = macros.sugarGrams > 15 || macros.carbsGrams > 60;
    const mediumByMacros = macros.carbsGrams > 30;
    return {
      preMealGlucose: null,
      postMealPeak: null,
      delta: null,
      causedSpike: false,
      impactLevel: highByMacros ? 'high' : mediumByMacros ? 'medium' : 'low',
      adviceNextMeal:
        `ℹ️ No hay lecturas de glucosa alrededor de esta comida, así que el impacto se estimó solo por sus ` +
        `${macros.carbsGrams}g de carbohidratos y ${macros.sugarGrams}g de azúcar. ` +
        `Subí el CSV del sensor que cubra este horario para ver tu respuesta real.`,
    };
  }

  const preReading = before[before.length - 1].value;
  const peakReading = Math.max(...after.map((r) => r.value));
  const delta = peakReading - preReading;
  const causedSpike = delta >= 35 || peakReading > 140;

  let impactLevel: 'low' | 'medium' | 'high';
  let adviceNextMeal: string;

  if (causedSpike) {
    impactLevel = 'high';
    adviceNextMeal = `⚠️ "${dishName}" provocó un pico de +${delta} mg/dL (máx ${peakReading} mg/dL) con ${macros.carbsGrams}g de carbohidratos y ${macros.sugarGrams}g de azúcar. Para la próxima: empezá por vegetales o proteína, sumá fibra o grasas saludables, o caminá 10-15 minutos después de comer.`;
  } else if (delta >= 20 || peakReading > 125) {
    impactLevel = 'medium';
    adviceNextMeal = `🟡 Respuesta moderada (+${delta} mg/dL). Para la siguiente comida, acompañá los carbohidratos con proteína magra o fibra.`;
  } else {
    impactLevel = 'low';
    adviceNextMeal = `🟢 Respuesta estable a "${dishName}" (variación de solo +${delta} mg/dL). Podés mantener una combinación similar.`;
  }

  return { preMealGlucose: preReading, postMealPeak: peakReading, delta, causedSpike, impactLevel, adviceNextMeal };
}
