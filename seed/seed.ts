import { readFileSync } from "fs";
import path from "path";
import { BatchWriteCommand } from "@aws-sdk/lib-dynamodb";
import { dynamoDb, TABLE_NAME } from "../src/lib/dynamodb";
import { toItem } from "../src/lib/player-item";
import type { Player } from "../src/types/player";

export async function seedDatabase(jsonPath: string): Promise<void> {
  const raw = readFileSync(jsonPath, "utf-8");
  const data = JSON.parse(raw) as { players: Player[] };

  const batches: Player[][] = [];
  for (let i = 0; i < data.players.length; i += 25) {
    batches.push(data.players.slice(i, i + 25));
  }

  for (const batch of batches) {
    // shortcut: UnprocessedItems not retried; fine for this 5-item one-time seed, add retry/backoff if dataset or throttling risk grows
    await dynamoDb.send(
      new BatchWriteCommand({
        RequestItems: {
          [TABLE_NAME]: batch.map((player) => ({ PutRequest: { Item: toItem(player) } })),
        },
      })
    );
  }
}

if (require.main === module) {
  seedDatabase(path.join(__dirname, "..", "headtohead.json")).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
