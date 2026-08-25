import { doc, getDoc, setDoc } from "firebase/firestore";
import { auth, db } from "./firebase";
import type { EmergencyContacts } from "../types/emergency";

const DEFAULTS: EmergencyContacts = {
  emergencyNumber: "911",
  doctorName: "",
  doctorPhone: "",
  contactName: "",
  contactPhone: "",
};

export async function getEmergencyContacts(): Promise<EmergencyContacts> {
  const user = auth.currentUser;
  if (!user) return { ...DEFAULTS };

  const ref = doc(db, "users", user.uid, "settings", "emergencyContacts");
  const snap = await getDoc(ref);
  if (!snap.exists()) return { ...DEFAULTS };

  return { ...DEFAULTS, ...(snap.data() as Partial<EmergencyContacts>) };
}

export async function saveEmergencyContacts(contacts: EmergencyContacts): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error("Usuario no autenticado");

  const ref = doc(db, "users", user.uid, "settings", "emergencyContacts");
  await setDoc(ref, contacts, { merge: true });
}
