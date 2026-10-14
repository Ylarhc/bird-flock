import request from "supertest";
import { app } from "../src/app";
import { prisma } from "../src/lib/prisma";

async function insertPlayer(id: number, countryCode: string, height: number, weight: number, last: number[]) {
  await prisma.player.create({
    data: {
      id,
      firstname: `P${id}`,
      lastname: "Test",
      shortname: `P${id}.T`,
      sex: "M",
      countryCode,
      countryPicture: "https://example.com/fra.png",
      picture: "https://example.com/test.png",
      rank: 1,
      points: 100,
      weight,
      height,
      age: 25,
      last: JSON.stringify(last),
    },
  });
}

describe("kpis routes", () => {
  beforeEach(async () => {
    await prisma.player.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("GET /kpis/best-country returns null with no players", async () => {
    const res = await request(app).get("/kpis/best-country");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ result: null });
  });

  it("GET /kpis/best-country returns the winning country", async () => {
    await insertPlayer(1, "AAA", 180, 70000, [1, 1]);
    await insertPlayer(2, "BBB", 180, 70000, [0, 0]);
    const res = await request(app).get("/kpis/best-country");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ result: { code: "AAA", ratio: 1 } });
  });

  it("GET /kpis/average-bmi returns null with no players", async () => {
    const res = await request(app).get("/kpis/average-bmi");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ result: null });
  });

  it("GET /kpis/average-bmi returns the computed average", async () => {
    await insertPlayer(1, "AAA", 175, 70000, [1]);
    await insertPlayer(2, "BBB", 160, 80000, [1]);
    const res = await request(app).get("/kpis/average-bmi");
    expect(res.status).toBe(200);
    expect(res.body.result).toBeCloseTo(27.0536, 3);
  });

  it("GET /kpis/median-height returns null with no players", async () => {
    const res = await request(app).get("/kpis/median-height");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ result: null });
  });

  it("GET /kpis/median-height returns the median", async () => {
    await insertPlayer(1, "AAA", 170, 70000, [1]);
    await insertPlayer(2, "BBB", 180, 70000, [1]);
    await insertPlayer(3, "CCC", 190, 70000, [1]);
    const res = await request(app).get("/kpis/median-height");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ result: 180 });
  });
});
