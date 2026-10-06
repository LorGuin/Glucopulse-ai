import { collection, addDoc, query, orderBy, limit, getDocs, deleteDoc, doc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "./firebase";
import type { MealRecord } from "../types/meal";
import { correlateMealWithGlucose } from "../utils/mealGlucoseCorrelator";
import type { GlucoseReading } from "../utils/glucoseAnalyzer";
import { callGemini } from "./aiClient";

interface GeminiMeal {
  dishName: string;
  ingredients: string[];
  calories: number;
  carbsGrams: number;
  sugarGrams: number;
  fatsGrams: number;
  proteinGrams: number;
  fiberGrams?: number;
  estimatedGlycemicIndex?: "bajo" | "medio" | "alto";
  confidence?: "baja" | "media" | "alta";
}

export async function analyzeMealImage(
  base64Image: string,
  eatenAt: Date,
  cgmData: GlucoseReading[] = []
): Promise<MealRecord> {
  const user = auth.currentUser;
  if (!user) throw new Error("Usuario no autenticado");

  // Gemini (vía /api/gemini) analiza la foto y devuelve JSON con esquema fijo.
  const { data: parsed } = await callGemini<{ data: GeminiMeal }>("meal", { imageDataUrl: base64Image });

  const macros = {
    calories: Math.round(Number(parsed.calories) || 0),
    fatsGrams: Math.round(Number(parsed.fatsGrams) || 0),
    carbsGrams: Math.round(Number(parsed.carbsGrams) || 0),
    sugarGrams: Math.round(Number(parsed.sugarGrams) || 0),
    proteinGrams: Math.round(Number(parsed.proteinGrams) || 0),
  };

  const dishName = parsed.dishName || "Comida Registrada";
  const ingredients = Array.isArray(parsed.ingredients) ? parsed.ingredients : [];

  const safeCGM = Array.isArray(cgmData) ? cgmData : [];
  const correlation = correlateMealWithGlucose(eatenAt, safeCGM, macros, dishName);

  const mealRecord: MealRecord = {
    userId: user.uid,
    dishName,
    imageUrl: base64Image,
    eatenAt: eatenAt.toISOString(),
    macros,
    ingredients,
    glycemicImpact: correlation.impactLevel,
    preMealGlucose: correlation.preMealGlucose,
    postMealPeak: correlation.postMealPeak,
    glucoseDelta: correlation.delta,
    causedSpike: correlation.causedSpike,
    aiAdviceNextMeal: correlation.adviceNextMeal,
    ...(parsed.estimatedGlycemicIndex ? { estimatedGlycemicIndex: parsed.estimatedGlycemicIndex } : {}),
    ...(parsed.confidence ? { aiConfidence: parsed.confidence } : {}),
  };

  const mealsRef = collection(db, "users", user.uid, "meals");
  await addDoc(mealsRef, {
    ...mealRecord,
    createdAt: serverTimestamp(),
  });

  return mealRecord;
}

export interface MealWithId extends MealRecord {
  id: string;
}

export async function getRecentMeals(maxEntries = 8): Promise<MealWithId[]> {
  const user = auth.currentUser;
  if (!user) return [];

  const mealsRef = collection(db, "users", user.uid, "meals");
  const q = query(mealsRef, orderBy("createdAt", "desc"), limit(maxEntries));
  const snap = await getDocs(q);

  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as MealRecord) }));
}

export async function deleteMeal(mealId: string): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error("Usuario no autenticado");

  await deleteDoc(doc(db, "users", user.uid, "meals", mealId));
}
