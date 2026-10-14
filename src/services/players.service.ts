import { GetCommand, PutCommand, DeleteCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import { dynamoDb, TABLE_NAME } from "../lib/dynamodb";
import { toItem, fromItem, PlayerItem } from "../lib/player-item";
import { NotFoundError, ConflictError } from "../errors";
import type { Player } from "../types/player";

export async function listPlayers(): Promise<Player[]> {
  const items: PlayerItem[] = [];
  let ExclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const res = await dynamoDb.send(new ScanCommand({ TableName: TABLE_NAME, ExclusiveStartKey }));
    items.push(...((res.Items as PlayerItem[] | undefined) ?? []));
    ExclusiveStartKey = res.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items.map(fromItem);
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
  return input;
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
  return updated;
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
