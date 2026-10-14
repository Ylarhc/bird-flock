import path from "path";
import { clearTable } from "./helpers/dynamodb-test-helpers";
import { seedDatabase } from "../seed/seed";
import * as playersService from "../src/services/players.service";

describe("seedDatabase", () => {
  beforeEach(async () => {
    await clearTable();
  });

  it("loads all 5 players from headtohead.json", async () => {
    await seedDatabase(path.join(__dirname, "..", "headtohead.json"));
    const players = await playersService.listPlayers();
    expect(players).toHaveLength(5);
  });

  it("maps Djokovic's fields and last array correctly", async () => {
    await seedDatabase(path.join(__dirname, "..", "headtohead.json"));
    const player = await playersService.getPlayer(52);
    expect(player.firstname).toBe("Novak");
    expect(player.data.rank).toBe(2);
    expect(player.data.last).toEqual([1, 1, 1, 1, 1]);
  });
});
