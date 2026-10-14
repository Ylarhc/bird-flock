import type { APIGatewayProxyEventV2 } from "aws-lambda";
import { clearTable } from "./helpers/dynamodb-test-helpers";
import * as playersService from "../src/services/players.service";
import { handler as all } from "../src/handlers/kpis/all";
import { handler as bestCountry } from "../src/handlers/kpis/bestCountry";
import { handler as averageBmi } from "../src/handlers/kpis/averageBmi";
import { handler as medianHeight } from "../src/handlers/kpis/medianHeight";
import type { Player } from "../src/types/player";

function makePlayer(id: number, countryCode: string, height: number, weight: number, last: number[]): Player {
  return {
    id,
    firstname: `P${id}`,
    lastname: "Test",
    shortname: `P${id}.T`,
    sex: "M",
    country: { code: countryCode, picture: "https://example.com/fra.png" },
    picture: "https://example.com/test.png",
    data: { rank: 1, points: 100, weight, height, age: 25, last },
  };
}

const event = {} as APIGatewayProxyEventV2;

describe("kpis handlers", () => {
  beforeEach(async () => {
    await clearTable();
  });

  it("GET /kpis returns all three KPIs as null on an empty table", async () => {
    const res = await all(event);
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body as string)).toEqual({
      bestCountry: null,
      averageBmi: null,
      medianHeight: null,
    });
  });

  it("GET /kpis returns all three KPIs computed together", async () => {
    await playersService.createPlayer(makePlayer(1, "AAA", 175, 70000, [1]));
    await playersService.createPlayer(makePlayer(2, "BBB", 160, 80000, [0]));
    const res = await all(event);
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body as string);
    expect(body.bestCountry).toEqual({ code: "AAA", ratio: 1 });
    expect(body.averageBmi).toBeCloseTo(27.0536, 3);
    expect(body.medianHeight).toBe(167.5);
  });

  it("GET /kpis/best-country returns null with no players", async () => {
    const res = await bestCountry(event);
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body as string)).toEqual({ result: null });
  });

  it("GET /kpis/best-country returns the winning country", async () => {
    await playersService.createPlayer(makePlayer(1, "AAA", 180, 70000, [1, 1]));
    await playersService.createPlayer(makePlayer(2, "BBB", 180, 70000, [0, 0]));
    const res = await bestCountry(event);
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body as string)).toEqual({ result: { code: "AAA", ratio: 1 } });
  });

  it("GET /kpis/average-bmi returns null with no players", async () => {
    const res = await averageBmi(event);
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body as string)).toEqual({ result: null });
  });

  it("GET /kpis/average-bmi returns the computed average", async () => {
    await playersService.createPlayer(makePlayer(1, "AAA", 175, 70000, [1]));
    await playersService.createPlayer(makePlayer(2, "BBB", 160, 80000, [1]));
    const res = await averageBmi(event);
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body as string).result).toBeCloseTo(27.0536, 3);
  });

  it("GET /kpis/median-height returns null with no players", async () => {
    const res = await medianHeight(event);
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body as string)).toEqual({ result: null });
  });

  it("GET /kpis/median-height returns the median", async () => {
    await playersService.createPlayer(makePlayer(1, "AAA", 170, 70000, [1]));
    await playersService.createPlayer(makePlayer(2, "BBB", 180, 70000, [1]));
    await playersService.createPlayer(makePlayer(3, "CCC", 190, 70000, [1]));
    const res = await medianHeight(event);
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body as string)).toEqual({ result: 180 });
  });
});
