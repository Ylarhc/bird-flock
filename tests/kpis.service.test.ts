import { prisma } from "../src/lib/prisma";
import * as kpisService from "../src/services/kpis.service";

async function insertPlayer(overrides: Partial<{
  id: number;
  countryCode: string;
  height: number;
  weight: number;
  last: number[];
}>) {
  const id = overrides.id ?? 1;
  await prisma.player.create({
    data: {
      id,
      firstname: `P${id}`,
      lastname: "Test",
      shortname: `P${id}.T`,
      sex: "M",
      countryCode: overrides.countryCode ?? "FRA",
      countryPicture: "https://example.com/fra.png",
      picture: "https://example.com/test.png",
      rank: 1,
      points: 100,
      weight: overrides.weight ?? 70000,
      height: overrides.height ?? 180,
      age: 25,
      last: JSON.stringify(overrides.last ?? [1, 0]),
    },
  });
}

describe("kpis.service", () => {
  beforeEach(async () => {
    await prisma.player.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe("getBestCountry", () => {
    it("returns null when there are no players", async () => {
      expect(await kpisService.getBestCountry()).toBeNull();
    });

    it("picks the country with the clear best win ratio", async () => {
      await insertPlayer({ id: 1, countryCode: "AAA", last: [1, 1] });
      await insertPlayer({ id: 2, countryCode: "BBB", last: [0, 0] });
      expect(await kpisService.getBestCountry()).toEqual({ code: "AAA", ratio: 1 });
    });

    it("breaks a tie alphabetically by country code", async () => {
      await insertPlayer({ id: 1, countryCode: "BBB", last: [1, 0] });
      await insertPlayer({ id: 2, countryCode: "AAA", last: [1, 0] });
      expect(await kpisService.getBestCountry()).toEqual({ code: "AAA", ratio: 0.5 });
    });
  });

  describe("getAverageBmi", () => {
    it("returns null when there are no players", async () => {
      expect(await kpisService.getAverageBmi()).toBeNull();
    });

    it("computes the average BMI across all players", async () => {
      await insertPlayer({ id: 1, weight: 70000, height: 175 });
      await insertPlayer({ id: 2, weight: 80000, height: 160 });
      const result = await kpisService.getAverageBmi();
      expect(result).toBeCloseTo(27.0536, 3);
    });
  });

  describe("getMedianHeight", () => {
    it("returns null when there are no players", async () => {
      expect(await kpisService.getMedianHeight()).toBeNull();
    });

    it("computes the median for an odd number of players", async () => {
      await insertPlayer({ id: 1, height: 170 });
      await insertPlayer({ id: 2, height: 190 });
      await insertPlayer({ id: 3, height: 180 });
      expect(await kpisService.getMedianHeight()).toBe(180);
    });

    it("computes the median for an even number of players", async () => {
      await insertPlayer({ id: 1, height: 170 });
      await insertPlayer({ id: 2, height: 180 });
      await insertPlayer({ id: 3, height: 190 });
      await insertPlayer({ id: 4, height: 200 });
      expect(await kpisService.getMedianHeight()).toBe(185);
    });
  });
});
