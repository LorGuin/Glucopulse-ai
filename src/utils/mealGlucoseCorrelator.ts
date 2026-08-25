import type { GlucoseReading } from "./glucoseAnalyzer";
import type { MacroNutrients } from "../types/meal";

export interface CorrelationResult {
  preMealGlucose: number;
  postMealPeak: number;
  delta: number;
  causedSpike: boolean;
  impactLevel: 'low' | 'medium' | 'high';
  adviceNextMeal: string;
}

export function correlateMealWithGlucose(
  mealTime: Date,
  cgmData: GlucoseReading[],
  macros: MacroNutrients,
  dishName: string
): CorrelationResult {
  const mealTimestamp = mealTime.getTime();
  const twoHoursAfter = mealTimestamp + 2 * 60 * 60 * 1000;

  const windowReadings = cgmData.filter(
    (r) => r.date.getTime() >= mealTimestamp && r.date.getTime() <= twoHoursAfter
  );

  const preReading = windowReadings.length > 0 ? windowReadings[0].value : 100;
  const peakReading =
    windowReadings.length > 0 ? Math.max(...windowReadings.map((r) => r.value)) : preReading;

  const delta = peakReading - preReading;
  const causedSpike = delta >= 35 || peakReading > 140;

  let impactLevel: 'low' | 'medium' | 'high' = 'low';
  let adviceNextMeal = "";

  if (causedSpike || macros.sugarGrams > 15 || delta >= 45) {
    impactLevel = 'high';
    adviceNextMeal = `⚠️ "${dishName}" provocó un pico de +${delta} mg/dL (máx ${peakReading} mg/dL) por sus ${macros.sugarGrams}g de azúcar y ${macros.carbsGrams}g de carbohidratos. Para tu próxima comida: consume vegetales de hoja verde antes de comer, agrega grasas saludables (palta/oliva) o camina 15 minutos.`;
  } else if (delta >= 20 || peakReading > 125) {
    impactLevel = 'medium';
    adviceNextMeal = `🟡 Respuesta moderada (+${delta} mg/dL). Para la siguiente comida, acompaña los carbohidratos con una fuente magra de proteína o fibra.`;
  } else {
    impactLevel = 'low';
    adviceNextMeal = `🟢 Respuesta óptima a "${dishName}" (curva estable con variación de solo +${delta} mg/dL). Puedes mantener una combinación similar.`;
  }

  return {
    preMealGlucose: preReading,
    postMealPeak: peakReading,
    delta,
    causedSpike,
    impactLevel,
    adviceNextMeal,
  };
}
