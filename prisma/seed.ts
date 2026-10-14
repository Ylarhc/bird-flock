import { readFileSync } from "fs";
import path from "path";
import type { PrismaClient } from "@prisma/client";
import { prisma } from "../src/lib/prisma";
import { toDbRow } from "../src/mappers/player.mapper";
import type { Player } from "../src/types/player";

export async function seedDatabase(prisma: PrismaClient, jsonPath: string): Promise<void> {
  const raw = readFileSync(jsonPath, "utf-8");
  const data = JSON.parse(raw) as { players: Player[] };
  for (const player of data.players) {
    const row = toDbRow(player);
    await prisma.player.upsert({
      where: { id: row.id },
      create: row,
      update: row,
    });
  }
}

if (require.main === module) {
  seedDatabase(prisma, path.join(__dirname, "..", "headtohead.json"))
    .then(() => prisma.$disconnect())
    .catch(async (err) => {
      console.error(err);
      await prisma.$disconnect();
      process.exit(1);
    });
}
