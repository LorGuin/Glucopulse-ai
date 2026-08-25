import {
  collection,
  addDoc,
  query,
  orderBy,
  limit,
  getDocs,
  serverTimestamp,
} from "firebase/firestore";
import { db, auth } from "./firebase";
import type { GlucoseEntry, GlucoseContext } from "../types/glucose";
import type { PeriodStats } from "../utils/glucoseAnalyzer";

// 1. Guardar una medición individual (manual o puntual)
export async function saveGlucoseReading(
  valueMgDl: number,
  context: GlucoseContext,
  notes = ""
): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error("Usuario no autenticado");

  const readingsRef = collection(db, "users", user.uid, "glucose_readings");
  const docRef = await addDoc(readingsRef, {
    userId: user.uid,
    valueMgDl,
    context,
    notes,
    createdAt: serverTimestamp(),
  });

  return docRef.id;
}

// 2. Guardar el análisis procesado del archivo CSV del sensor
export async function saveCGMAnalysis(stats: PeriodStats, filename: string): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error("Usuario no autenticado");

  const historyRef = collection(db, "users", user.uid, "cgm_history");
  const docRef = await addDoc(historyRef, {
    userId: user.uid,
    filename,
    period: stats.period,
    average: stats.average,
    max: stats.max,
    min: stats.min,
    timeInRangePercent: stats.timeInRangePercent,
    totalReadings: stats.readings.length,
    createdAt: serverTimestamp(),
  });

  return docRef.id;
}

// 3. Consultar las últimas mediciones para renderizar la gráfica
export async function getRecentGlucoseReadings(maxEntries = 30): Promise<GlucoseEntry[]> {
  const user = auth.currentUser;
  if (!user) return [];

  const readingsRef = collection(db, "users", user.uid, "glucose_readings");
  const q = query(readingsRef, orderBy("createdAt", "desc"), limit(maxEntries));
  const snapshot = await getDocs(q);

  return snapshot.docs
    .map((docSnap) => {
      const data = docSnap.data();
      return {
        id: docSnap.id,
        userId: data.userId,
        valueMgDl: data.valueMgDl,
        context: data.context,
        createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
      };
    })
    .reverse();
}
