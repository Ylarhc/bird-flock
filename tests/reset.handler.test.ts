import type { APIGatewayProxyEventV2 } from "aws-lambda";
import { clearTable } from "./helpers/dynamodb-test-helpers";
import { handler as reset } from "../src/handlers/reset";
import { handler as create } from "../src/handlers/players/create";
import * as playersService from "../src/services/players.service";

const fixture = {
  id: 9999,
  firstname: "Stray",
  lastname: "Player",
  shortname: "S.PLA",
  sex: "M",
  country: { picture: "https://example.com/fra.png", code: "FRA" },
  picture: "https://example.com/test.png",
  data: { rank: 1, points: 100, weight: 80000, height: 180, age: 25, last: [1, 0, 1] },
};

function event(): APIGatewayProxyEventV2 {
  return {} as APIGatewayProxyEventV2;
}

describe("reset handler", () => {
  beforeEach(async () => {
    await clearTable();
  });

  it("returns 204 and reloads the 5 seed players, dropping anything else", async () => {
    await create({ body: JSON.stringify(fixture) } as APIGatewayProxyEventV2);
    const res = await reset(event());
    expect(res.statusCode).toBe(204);
    const players = await playersService.listPlayers();
    expect(players).toHaveLength(5);
    expect(players.find((p) => p.id === fixture.id)).toBeUndefined();
  });

  it("maps Djokovic's fields correctly after reset", async () => {
    await reset(event());
    const player = await playersService.getPlayer(52);
    expect(player.firstname).toBe("Novak");
  });
});
