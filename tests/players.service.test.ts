import { clearTable } from "./helpers/dynamodb-test-helpers";
import * as playersService from "../src/services/players.service";
import { NotFoundError, ConflictError } from "../src/errors";
import type { Player } from "../src/types/player";

const fixture: Player = {
  id: 1,
  firstname: "Test",
  lastname: "Player",
  shortname: "T.PLA",
  sex: "M",
  country: { picture: "https://example.com/fra.png", code: "FRA" },
  picture: "https://example.com/test.png",
  data: { rank: 1, points: 100, weight: 80000, height: 180, age: 25, last: [1, 0, 1] },
};

describe("players.service", () => {
  beforeEach(async () => {
    await clearTable();
  });

  it("creates and lists a player", async () => {
    await playersService.createPlayer(fixture);
    const players = await playersService.listPlayers();
    expect(players).toEqual([fixture]);
  });

  it("gets a player by id", async () => {
    await playersService.createPlayer(fixture);
    const player = await playersService.getPlayer(1);
    expect(player).toEqual(fixture);
  });

  it("throws NotFoundError for a missing id on get", async () => {
    await expect(playersService.getPlayer(999)).rejects.toThrow(NotFoundError);
  });

  it("throws ConflictError when creating a duplicate id", async () => {
    await playersService.createPlayer(fixture);
    await expect(playersService.createPlayer(fixture)).rejects.toThrow(ConflictError);
  });

  it("updates a player", async () => {
    await playersService.createPlayer(fixture);
    const updated = await playersService.updatePlayer(1, { ...fixture, firstname: "Changed" });
    expect(updated.firstname).toBe("Changed");
    expect(updated.id).toBe(1);
  });

  it("throws NotFoundError when updating a missing id", async () => {
    await expect(playersService.updatePlayer(999, fixture)).rejects.toThrow(NotFoundError);
  });

  it("deletes a player", async () => {
    await playersService.createPlayer(fixture);
    await playersService.deletePlayer(1);
    await expect(playersService.getPlayer(1)).rejects.toThrow(NotFoundError);
  });

  it("throws NotFoundError when deleting a missing id", async () => {
    await expect(playersService.deletePlayer(999)).rejects.toThrow(NotFoundError);
  });

  it("propagates a non-conditional DynamoDB error as a plain error, not NotFound/Conflict", async () => {
    const { dynamoDb } = await import("../src/lib/dynamodb");
    const { GetCommand } = await import("@aws-sdk/lib-dynamodb");
    await expect(
      dynamoDb.send(new GetCommand({ TableName: "DoesNotExist", Key: { id: 1 } }))
    ).rejects.not.toBeInstanceOf(NotFoundError);
  });
});
