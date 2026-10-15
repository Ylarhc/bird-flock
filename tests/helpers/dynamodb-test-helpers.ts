import * as playersService from "../../src/services/players.service";

export async function clearTable(): Promise<void> {
  await playersService.clearPlayers();
}
