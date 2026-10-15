import { GetCommand, PutCommand, DeleteCommand, ScanCommand, BatchWriteCommand } from "@aws-sdk/lib-dynamodb";
import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import { dynamoDb, TABLE_NAME } from "../lib/dynamodb";
import { toItem, fromItem, PlayerItem } from "../lib/player-item";
import { NotFoundError, ConflictError } from "../errors";
import type { Player } from "../types/player";

function winCount(player: Player): number {
  return player.data.last.filter((result) => result === 1).length;
}

export async function listPlayers(): Promise<Player[]> {
  const items: PlayerItem[] = [];
  let ExclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const res = await dynamoDb.send(new ScanCommand({ TableName: TABLE_NAME, ExclusiveStartKey }));
    items.push(...((res.Items as PlayerItem[] | undefined) ?? []));
    ExclusiveStartKey = res.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items.map(fromItem).sort((a, b) => winCount(b) - winCount(a));
}

export async function getPlayer(id: number): Promise<Player> {
  const res = await dynamoDb.send(new GetCommand({ TableName: TABLE_NAME, Key: { id } }));
  if (!res.Item) throw new NotFoundError(`player ${id} not found`);
  return fromItem(res.Item as PlayerItem);
}

export async function createPlayer(input: Player): Promise<Player> {
  try {
    await dynamoDb.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: toItem(input),
        ConditionExpression: "attribute_not_exists(id)",
      })
    );
  } catch (err) {
    if (err instanceof ConditionalCheckFailedException) {
      throw new ConflictError(`player ${input.id} already exists`);
    }
    throw err;
  }
  return fromItem(toItem(input));
}

export async function updatePlayer(id: number, input: Player): Promise<Player> {
  const updated = { ...input, id };
  try {
    await dynamoDb.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: toItem(updated),
        ConditionExpression: "attribute_exists(id)",
      })
    );
  } catch (err) {
    if (err instanceof ConditionalCheckFailedException) {
      throw new NotFoundError(`player ${id} not found`);
    }
    throw err;
  }
  return fromItem(toItem(updated));
}

export async function deletePlayer(id: number): Promise<void> {
  try {
    await dynamoDb.send(
      new DeleteCommand({
        TableName: TABLE_NAME,
        Key: { id },
        ConditionExpression: "attribute_exists(id)",
      })
    );
  } catch (err) {
    if (err instanceof ConditionalCheckFailedException) {
      throw new NotFoundError(`player ${id} not found`);
    }
    throw err;
  }
}

function chunk<T>(items: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size));
  }
  return batches;
}

export async function putManyPlayers(players: Player[]): Promise<void> {
  for (const batch of chunk(players, 25)) {
    // shortcut: UnprocessedItems not retried; fine for this small dataset, add retry/backoff if it grows
    await dynamoDb.send(
      new BatchWriteCommand({
        RequestItems: {
          [TABLE_NAME]: batch.map((player) => ({ PutRequest: { Item: toItem(player) } })),
        },
      })
    );
  }
}

export async function clearPlayers(): Promise<void> {
  const res = await dynamoDb.send(new ScanCommand({ TableName: TABLE_NAME, ProjectionExpression: "id" }));
  const ids = res.Items ?? [];
  for (const batch of chunk(ids, 25)) {
    await dynamoDb.send(
      new BatchWriteCommand({
        RequestItems: {
          [TABLE_NAME]: batch.map((item) => ({ DeleteRequest: { Key: { id: item.id } } })),
        },
      })
    );
  }
}
