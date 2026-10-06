import { collection, doc, getDocs, query, orderBy, limit, documentId, writeBatch } from "firebase/firestore";
import { auth, db } from "./firebase";
import type { GlucoseReading } from "../utils/glucoseAnalyzer";

// Guarda las lecturas del sensor (CSV) en Firestore, agrupadas por día:
//   users/{uid}/cgm_days/{YYYY-MM-DD} = { r: { "<timestamp ms>": valor, ... } }
// Un día de Lingo/Libre son ~288 lecturas (≈5 KB), muy lejos del límite de
// 1 MB por documento. Como las lecturas se guardan con merge por timestamp,
// subir dos veces el mismo CSV (o CSVs que se superponen) no duplica nada.

const DAYS_TO_LOAD = 90;
const BATCH_LIMIT = 400;

function dayKey(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export async function saveCgmReadings(readings: GlucoseReading[]): Promise<number> {
  const user = auth.currentUser;
  if (!user) throw new Error("Usuario no autenticado");

  const byDay = new Map<string, Record<string, number>>();
  for (const r of readings) {
    const key = dayKey(r.date);
    if (!byDay.has(key)) byDay.set(key, {});
    byDay.get(key)![String(r.date.getTime())] = r.value;
  }

  const entries = [...byDay.entries()];
  for (let i = 0; i < entries.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db);
    for (const [key, values] of entries.slice(i, i + BATCH_LIMIT)) {
      batch.set(doc(db, "users", user.uid, "cgm_days", key), { r: values }, { merge: true });
    }
    await batch.commit();
  }
  return entries.length;
}

// Carga los últimos N días QUE TENGAN datos (no los últimos N días del
// calendario), así un CSV viejo sigue apareciendo aunque pasen los meses.
export async function loadCgmReadings(maxDays = DAYS_TO_LOAD): Promise<GlucoseReading[]> {
  const user = auth.currentUser;
  if (!user) return [];

  const ref = collection(db, "users", user.uid, "cgm_days");
  const snap = await getDocs(query(ref, orderBy(documentId(), "desc"), limit(maxDays)));

  const readings: GlucoseReading[] = [];
  snap.forEach((d) => {
    const r = (d.data().r ?? {}) as Record<string, number>;
    for (const [ts, value] of Object.entries(r)) {
      readings.push({ date: new Date(Number(ts)), value: Number(value) });
    }
  });
  return readings.sort((a, b) => a.date.getTime() - b.date.getTime());
}

// Une lecturas nuevas con las existentes sin duplicar (misma marca de tiempo).
export function mergeReadings(a: GlucoseReading[], b: GlucoseReading[]): GlucoseReading[] {
  const map = new Map<number, GlucoseReading>();
  for (const r of [...a, ...b]) map.set(r.date.getTime(), r);
  return [...map.values()].sort((x, y) => x.date.getTime() - y.date.getTime());
}
