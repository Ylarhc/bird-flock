import type { APIGatewayProxyEventV2 } from "aws-lambda";
import { clearTable } from "./helpers/dynamodb-test-helpers";
import { handler as list } from "../src/handlers/players/list";
import { handler as get } from "../src/handlers/players/get";
import { handler as create } from "../src/handlers/players/create";
import { handler as update } from "../src/handlers/players/update";
import { handler as remove } from "../src/handlers/players/remove";

const fixture = {
  id: 1,
  firstname: "Test",
  lastname: "Player",
  shortname: "T.PLA",
  sex: "M",
  country: { picture: "https://example.com/fra.png", code: "FRA" },
  picture: "https://example.com/test.png",
  data: { rank: 1, points: 100, weight: 80000, height: 180, age: 25, last: [1, 0, 1] },
};

function event(overrides: Partial<APIGatewayProxyEventV2> = {}): APIGatewayProxyEventV2 {
  return {
    pathParameters: {},
    body: undefined,
    ...overrides,
  } as APIGatewayProxyEventV2;
}

describe("players handlers", () => {
  beforeEach(async () => {
    await clearTable();
  });

  it("list returns 200 with all players", async () => {
    await create(event({ body: JSON.stringify(fixture) }));
    const res = await list(event());
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body as string)).toEqual([fixture]);
  });

  it("get returns 200 with the player", async () => {
    await create(event({ body: JSON.stringify(fixture) }));
    const res = await get(event({ pathParameters: { id: "1" } }));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body as string)).toEqual(fixture);
  });

  it("get returns 404 for a missing id", async () => {
    const res = await get(event({ pathParameters: { id: "999" } }));
    expect(res.statusCode).toBe(404);
  });

  it("get returns 400 for a non-numeric id", async () => {
    const res = await get(event({ pathParameters: { id: "abc" } }));
    expect(res.statusCode).toBe(400);
  });

  it("get returns 400 when the id path parameter is missing", async () => {
    const res = await get(event({ pathParameters: {} }));
    expect(res.statusCode).toBe(400);
  });

  it("create returns 201 with the created player", async () => {
    const res = await create(event({ body: JSON.stringify(fixture) }));
    expect(res.statusCode).toBe(201);
    expect(JSON.parse(res.body as string)).toEqual(fixture);
  });

  it("create returns 400 for an invalid body", async () => {
    const res = await create(event({ body: JSON.stringify({ ...fixture, sex: "X" }) }));
    expect(res.statusCode).toBe(400);
  });

  it("create returns 409 for a duplicate id", async () => {
    await create(event({ body: JSON.stringify(fixture) }));
    const res = await create(event({ body: JSON.stringify(fixture) }));
    expect(res.statusCode).toBe(409);
  });

  it("update returns 200 with the updated player", async () => {
    await create(event({ body: JSON.stringify(fixture) }));
    const res = await update(
      event({ pathParameters: { id: "1" }, body: JSON.stringify({ ...fixture, firstname: "Changed" }) })
    );
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body as string).firstname).toBe("Changed");
  });

  it("update returns 404 for a missing id", async () => {
    const res = await update(event({ pathParameters: { id: "999" }, body: JSON.stringify(fixture) }));
    expect(res.statusCode).toBe(404);
  });

  it("remove returns 204", async () => {
    await create(event({ body: JSON.stringify(fixture) }));
    const res = await remove(event({ pathParameters: { id: "1" } }));
    expect(res.statusCode).toBe(204);
  });

  it("remove returns 404 for a missing id", async () => {
    const res = await remove(event({ pathParameters: { id: "999" } }));
    expect(res.statusCode).toBe(404);
  });
});
