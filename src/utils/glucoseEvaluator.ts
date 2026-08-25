import type { GlucoseContext, GlucoseEvaluation } from '../types/glucose';

export const evaluateGlucose = (
  value: number,
  context: GlucoseContext = 'postprandial'
): GlucoseEvaluation => {
  if (value < 70) {
    return {
      status: 'danger_low',
      color: '#ef4444',
      label: 'Hipoglucemia',
      message: 'Nivel bajo. Consume 15g de carbohidratos simples de inmediato.',
      isEmergency: true,
    };
  }

  const upperLimit = context === 'fasting' ? 130 : 180;
  const warningLimit = context === 'fasting' ? 180 : 250;

  if (value <= upperLimit) {
    return {
      status: 'green',
      color: '#10b981',
      label: 'En Rango',
      message: 'Nivel glucémico óptimo.',
      isEmergency: false,
    };
  }

  if (value <= warningLimit) {
    return {
      status: 'yellow',
      color: '#f59e0b',
      label: 'Precaución',
      message: 'Ligera elevación glucémica.',
      isEmergency: false,
    };
  }

  return {
    status: 'danger_high',
    color: '#ef4444',
    label: 'Hiperglucemia',
    message: 'Nivel crítico. Sigue las indicaciones médicas.',
    isEmergency: true,
  };
};
