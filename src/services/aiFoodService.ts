import { collection, addDoc, query, orderBy, limit, getDocs, deleteDoc, doc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "./firebase";
import type { MealRecord } from "../types/meal";
import { correlateMealWithGlucose } from "../utils/mealGlucoseCorrelator";
import type { GlucoseReading } from "../utils/glucoseAnalyzer";

export async function analyzeMealImage(
  base64Image: string,
  eatenAt: Date,
  cgmData: GlucoseReading[] = []
): Promise<MealRecord> {
  const user = auth.currentUser;
  if (!user) throw new Error("Usuario no autenticado");

  const prompt = `Actúa como un médico endocrinólogo y nutricionista experto en metabolismo y diabetes.
Analiza la comida presente en la fotografía.
Devuelve EXCLUSIVAMENTE un objeto JSON válido con los valores numéricos y nombres calculados:
{
  "dishName": "Nombre descriptivo del plato",
  "ingredients": ["ingrediente 1", "ingrediente 2"],
  "calories": 650,
  "fatsGrams": 32,
  "carbsGrams": 58,
  "sugarGrams": 4,
  "proteinGrams": 35
}`;

  // Llama a nuestra propia función serverless (api/groq-vision.ts), mandando
  // la imagen completa (con su prefijo data:image/xxx;base64,...) tal cual
  // salió del canvas en MealCaptureModal.ts. La clave de Groq nunca viaja
  // al navegador y no hay problema de CORS porque el request queda dentro
  // del mismo origen.
  const response = await fetch("/api/groq-vision", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageDataUrl: base64Image, prompt }),
  });

  const resultData = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(resultData.error || `Error en el servidor (${response.status})`);
  }

  const rawText: string = resultData.text || "{}";
  const cleanJson = rawText.replace(/```(?:json)?\n?/g, "").trim();
  const parsed = JSON.parse(cleanJson);

  const macros = {
    calories: Math.round(Number(parsed.calories) || 0),
    fatsGrams: Math.round(Number(parsed.fatsGrams) || 0),
    carbsGrams: Math.round(Number(parsed.carbsGrams) || 0),
    sugarGrams: Math.round(Number(parsed.sugarGrams) || 0),
    proteinGrams: Math.round(Number(parsed.proteinGrams) || 0),
  };

  const dishName = parsed.dishName || "Comida Registrada";
  const ingredients = parsed.ingredients || [];

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
