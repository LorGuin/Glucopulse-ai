export interface MacroNutrients {
  calories: number;
  fatsGrams: number;
  carbsGrams: number;
  sugarGrams: number;
  proteinGrams: number;
}

export type GlycemicImpact = "low" | "medium" | "high";

export interface MealRecord {
  userId: string;
  dishName: string;
  imageUrl: string;
  eatenAt: string;
  macros: MacroNutrients;
  ingredients: string[];
  glycemicImpact: GlycemicImpact;
  // null cuando no había lecturas de glucosa alrededor de la comida
  preMealGlucose: number | null;
  postMealPeak: number | null;
  glucoseDelta: number | null;
  causedSpike: boolean;
  aiAdviceNextMeal: string;
  estimatedGlycemicIndex?: "bajo" | "medio" | "alto";
  aiConfidence?: "baja" | "media" | "alta";
}
