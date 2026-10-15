import { ScanCommand, BatchWriteCommand } from "@aws-sdk/lib-dynamodb";
import { dynamoDb, TABLE_NAME } from "../../src/lib/dynamodb";

export async function clearTable(): Promise<void> {
  const res = await dynamoDb.send(new ScanCommand({ TableName: TABLE_NAME, ProjectionExpression: "id" }));
  const items = res.Items ?? [];
  if (items.length === 0) return;
  await dynamoDb.send(
    new BatchWriteCommand({
      RequestItems: {
        [TABLE_NAME]: items.map((item) => ({ DeleteRequest: { Key: { id: item.id } } })),
      },
    })
  );
}
