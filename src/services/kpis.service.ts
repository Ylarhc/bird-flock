import { prisma } from "../lib/prisma";

export interface BestCountryResult {
  code: string;
  ratio: number;
}

export async function getBestCountry(): Promise<BestCountryResult | null> {
  const rows = await prisma.player.findMany();
  if (rows.length === 0) return null;

  const byCountry = new Map<string, { wins: number; games: number }>();
  for (const row of rows) {
    const last = JSON.parse(row.last) as number[];
    const wins = last.filter((v) => v === 1).length;
    const games = last.length;
    const entry = byCountry.get(row.countryCode) ?? { wins: 0, games: 0 };
    entry.wins += wins;
    entry.games += games;
    byCountry.set(row.countryCode, entry);
  }

  const sortedCodes = [...byCountry.keys()].sort((a, b) => a.localeCompare(b));

  let best: BestCountryResult | null = null;
  for (const code of sortedCodes) {
    const { wins, games } = byCountry.get(code)!;
    const ratio = games === 0 ? 0 : wins / games;
    if (best === null || ratio > best.ratio) {
      best = { code, ratio };
    }
  }
  return best;
}

export async function getAverageBmi(): Promise<number | null> {
  const rows = await prisma.player.findMany();
  if (rows.length === 0) return null;

  const total = rows.reduce((sum, row) => {
    const weightKg = row.weight / 1000;
    const heightM = row.height / 100;
    return sum + weightKg / (heightM * heightM);
  }, 0);

  return total / rows.length;
}

export async function getMedianHeight(): Promise<number | null> {
  const rows = await prisma.player.findMany();
  if (rows.length === 0) return null;

  const heights = rows.map((row) => row.height).sort((a, b) => a - b);
  const mid = Math.floor(heights.length / 2);
  if (heights.length % 2 === 0) {
    return (heights[mid - 1] + heights[mid]) / 2;
  }
  return heights[mid];
}
