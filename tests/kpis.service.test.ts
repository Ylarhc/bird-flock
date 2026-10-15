import { clearTable } from "./helpers/dynamodb-test-helpers";
import * as playersService from "../src/services/players.service";
import * as kpisService from "../src/services/kpis.service";
import type { Player } from "../src/types/player";

function makePlayer(overrides: Partial<{
  id: number;
  countryCode: string;
  height: number;
  weight: number;
  last: number[];
}>): Player {
  const id = overrides.id ?? 1;
  return {
    id,
    firstname: `P${id}`,
    lastname: "Test",
    shortname: `P${id}.T`,
    sex: "M",
    country: { code: overrides.countryCode ?? "FRA", picture: "https://example.com/fra.png" },
    picture: "https://example.com/test.png",
    data: {
      rank: 1,
      points: 100,
      weight: overrides.weight ?? 70000,
      height: overrides.height ?? 180,
      age: 25,
      last: overrides.last ?? [1, 0],
    },
  };
}

describe("kpis.service", () => {
  beforeEach(async () => {
    await clearTable();
  });

  describe("getBestCountry", () => {
    it("returns null when there are no players", async () => {
      expect(await kpisService.getBestCountry()).toBeNull();
    });

    it("picks the country with the clear best win ratio", async () => {
      await playersService.createPlayer(makePlayer({ id: 1, countryCode: "AAA", last: [1, 1] }));
      await playersService.createPlayer(makePlayer({ id: 2, countryCode: "BBB", last: [0, 0] }));
      expect(await kpisService.getBestCountry()).toEqual({ code: "AAA", ratio: 1 });
    });

    it("breaks a tie alphabetically by country code", async () => {
      await playersService.createPlayer(makePlayer({ id: 1, countryCode: "BBB", last: [1, 0] }));
      await playersService.createPlayer(makePlayer({ id: 2, countryCode: "AAA", last: [1, 0] }));
      expect(await kpisService.getBestCountry()).toEqual({ code: "AAA", ratio: 0.5 });
    });
  });

  describe("getAverageBmi", () => {
    it("returns null when there are no players", async () => {
      expect(await kpisService.getAverageBmi()).toBeNull();
    });

    it("computes the average BMI across all players", async () => {
      await playersService.createPlayer(makePlayer({ id: 1, weight: 70000, height: 175 }));
      await playersService.createPlayer(makePlayer({ id: 2, weight: 80000, height: 160 }));
      const result = await kpisService.getAverageBmi();
      expect(result).toBeCloseTo(27.0536, 3);
    });
  });

  describe("getMedianHeight", () => {
    it("returns null when there are no players", async () => {
      expect(await kpisService.getMedianHeight()).toBeNull();
    });

    it("computes the median for an odd number of players", async () => {
      await playersService.createPlayer(makePlayer({ id: 1, height: 170 }));
      await playersService.createPlayer(makePlayer({ id: 2, height: 190 }));
      await playersService.createPlayer(makePlayer({ id: 3, height: 180 }));
      expect(await kpisService.getMedianHeight()).toBe(180);
    });

    it("computes the median for an even number of players", async () => {
      await playersService.createPlayer(makePlayer({ id: 1, height: 170 }));
      await playersService.createPlayer(makePlayer({ id: 2, height: 180 }));
      await playersService.createPlayer(makePlayer({ id: 3, height: 190 }));
      await playersService.createPlayer(makePlayer({ id: 4, height: 200 }));
      expect(await kpisService.getMedianHeight()).toBe(185);
    });

    it("follows pagination across multiple pages instead of reading only the first page", async () => {
      for (let i = 1; i <= 5; i++) {
        await playersService.createPlayer(makePlayer({ id: i, height: 150 + i }));
      }
      // forcePageSize is read by kpis.service's internal query helper only in test mode
      process.env.KPI_TEST_PAGE_SIZE = "1";
      try {
        const result = await kpisService.getMedianHeight();
        expect(result).toBe(153); // heights 151..155, median is 153
      } finally {
        delete process.env.KPI_TEST_PAGE_SIZE;
      }
    });
  });
});
