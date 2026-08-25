export type GlucoseContext = "fasting" | "postprandial" | "random";

export interface GlucoseEntry {
  id: string;
  userId: string;
  valueMgDl: number;
  context: GlucoseContext;
  createdAt: Date;
}

export type GlucoseStatus = "green" | "yellow" | "danger_low" | "danger_high";

export interface GlucoseEvaluation {
  status: GlucoseStatus;
  color: string;
  label: string;
  message: string;
  isEmergency: boolean;
}
