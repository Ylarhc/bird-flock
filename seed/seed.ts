import { readFileSync } from "fs";
import path from "path";
import * as playersService from "../src/services/players.service";
import type { Player } from "../src/types/player";

export async function seedDatabase(jsonPath: string): Promise<void> {
  const raw = readFileSync(jsonPath, "utf-8");
  const data = JSON.parse(raw) as { players: Player[] };
  await playersService.putManyPlayers(data.players);
}

if (require.main === module) {
  seedDatabase(path.join(__dirname, "..", "headtohead.json")).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
