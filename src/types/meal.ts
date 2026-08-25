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
  preMealGlucose: number;
  postMealPeak: number;
  glucoseDelta: number;
  causedSpike: boolean;
  aiAdviceNextMeal: string;
}
