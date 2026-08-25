export interface GlucoseReading {
  date: Date;
  value: number;
}

export interface PeriodStats {
  period: 'day' | 'week' | 'month';
  average: number;
  max: number;
  min: number;
  timeInRangePercent: number;
  readings: GlucoseReading[];
  svgPoints: string;
}

// 1. Procesa el texto CSV del sensor y genera la lista ordenada cronológicamente
export function parseCGMFile(fileContent: string): GlucoseReading[] {
  const lines = fileContent.trim().split(/\r?\n/);
  const data: GlucoseReading[] = [];

  for (let i = 1; i < lines.length; i++) {
    const row = lines[i].split(",");
    if (row.length < 2) continue;

    const rawDate = row[0].trim();
    const rawVal = parseFloat(row[1].trim());

    if (!isNaN(rawVal)) {
      const parsedDate = new Date(rawDate);
      if (!isNaN(parsedDate.getTime())) {
        data.push({ date: parsedDate, value: rawVal });
      }
    }
  }

  return data.sort((a, b) => a.date.getTime() - b.date.getTime());
}

// 2. Calcula las coordenadas para el gráfico SVG
function computeSvgPoints(readings: GlucoseReading[]): string {
  if (readings.length < 2) return "0,60 400,60";

  const step = Math.max(1, Math.floor(readings.length / 100));
  const sampled = readings.filter((_, idx) => idx % step === 0);

  const width = 400;
  const height = 120;
  const minRange = 40;
  const maxRange = 220;

  return sampled
    .map((r, i) => {
      const x = (i / (sampled.length - 1)) * width;
      const clampedVal = Math.min(Math.max(r.value, minRange), maxRange);
      const y = height - ((clampedVal - minRange) / (maxRange - minRange)) * height;
      return `${Math.round(x)},${Math.round(y)}`;
    })
    .join(" ");
}

// 3. Agrupa por Día, Semana o Mes y calcula estadísticas
export function analyzePeriod(
  allReadings: GlucoseReading[],
  period: 'day' | 'week' | 'month'
): PeriodStats {
  if (allReadings.length === 0) {
    return {
      period,
      average: 0,
      max: 0,
      min: 0,
      timeInRangePercent: 0,
      readings: [],
      svgPoints: "0,60 400,60",
    };
  }

  const latestTime = allReadings[allReadings.length - 1].date.getTime();
  const timeWindows = {
    day: 24 * 60 * 60 * 1000,
    week: 7 * 24 * 60 * 60 * 1000,
    month: 30 * 24 * 60 * 60 * 1000,
  };

  const cutoff = latestTime - timeWindows[period];
  const filtered = allReadings.filter((r) => r.date.getTime() >= cutoff);
  const targetData = filtered.length > 0 ? filtered : allReadings.slice(-50);

  const sum = targetData.reduce((acc, r) => acc + r.value, 0);
  const avg = Math.round(sum / targetData.length);
  const max = Math.max(...targetData.map((r) => r.value));
  const min = Math.min(...targetData.map((r) => r.value));

  const inRangeCount = targetData.filter((r) => r.value >= 70 && r.value <= 140).length;
  const timeInRangePercent = Math.round((inRangeCount / targetData.length) * 100);

  return {
    period,
    average: avg,
    max,
    min,
    timeInRangePercent,
    readings: targetData,
    svgPoints: computeSvgPoints(targetData),
  };
}
