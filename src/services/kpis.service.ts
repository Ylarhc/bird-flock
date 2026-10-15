import { QueryCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { dynamoDb, TABLE_NAME } from "../lib/dynamodb";
import type { PlayerItem } from "../lib/player-item";

export interface BestCountryResult {
  code: string;
  ratio: number;
}

function testPageLimit(): number | undefined {
  const raw = process.env.KPI_TEST_PAGE_SIZE;
  return raw ? Number(raw) : undefined;
}

async function scanCountryIndex(): Promise<Pick<PlayerItem, "countryCode" | "data">[]> {
  const items: Pick<PlayerItem, "countryCode" | "data">[] = [];
  let ExclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const res = await dynamoDb.send(
      new ScanCommand({
        TableName: TABLE_NAME,
        IndexName: "CountryIndex",
        ExclusiveStartKey,
        Limit: testPageLimit(),
      })
    );
    items.push(...((res.Items as Pick<PlayerItem, "countryCode" | "data">[] | undefined) ?? []));
    ExclusiveStartKey = res.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items;
}

async function scanTable(): Promise<PlayerItem[]> {
  const items: PlayerItem[] = [];
  let ExclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const res = await dynamoDb.send(
      new ScanCommand({ TableName: TABLE_NAME, ExclusiveStartKey, Limit: testPageLimit() })
    );
    items.push(...((res.Items as PlayerItem[] | undefined) ?? []));
    ExclusiveStartKey = res.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items;
}

async function queryHeightIndex(): Promise<number[]> {
  const heights: number[] = [];
  let ExclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const res = await dynamoDb.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: "HeightIndex",
        KeyConditionExpression: "recordType = :r",
        ExpressionAttributeValues: { ":r": "PLAYER" },
        ExclusiveStartKey,
        Limit: testPageLimit(),
      })
    );
    heights.push(...((res.Items as { height: number }[] | undefined)?.map((i) => i.height) ?? []));
    ExclusiveStartKey = res.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return heights;
}

export async function getBestCountry(): Promise<BestCountryResult | null> {
  const items = await scanCountryIndex();
  if (items.length === 0) return null;

  const byCountry = new Map<string, { wins: number; games: number }>();
  for (const item of items) {
    const last = item.data.last;
    const wins = last.filter((v) => v === 1).length;
    const games = last.length;
    const entry = byCountry.get(item.countryCode) ?? { wins: 0, games: 0 };
    entry.wins += wins;
    entry.games += games;
    byCountry.set(item.countryCode, entry);
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
  const items = await scanTable();
  if (items.length === 0) return null;

  const total = items.reduce((sum, item) => {
    const weightKg = item.data.weight / 1000;
    const heightM = item.data.height / 100;
    return sum + weightKg / (heightM * heightM);
  }, 0);

  return total / items.length;
}

export async function getMedianHeight(): Promise<number | null> {
  const heights = await queryHeightIndex();
  if (heights.length === 0) return null;

  const mid = Math.floor(heights.length / 2);
  if (heights.length % 2 === 0) {
    return (heights[mid - 1] + heights[mid]) / 2;
  }
  return heights[mid];
}
