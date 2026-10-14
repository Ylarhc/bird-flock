import path from "path";
import { prisma } from "../src/lib/prisma";
import { seedDatabase } from "../prisma/seed";

describe("seedDatabase", () => {
  beforeEach(async () => {
    await prisma.player.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("loads all 5 players from headtohead.json", async () => {
    await seedDatabase(prisma, path.join(__dirname, "..", "headtohead.json"));
    const rows = await prisma.player.findMany();
    expect(rows).toHaveLength(5);
  });

  it("maps Djokovic's fields and last array correctly", async () => {
    await seedDatabase(prisma, path.join(__dirname, "..", "headtohead.json"));
    const row = await prisma.player.findUnique({ where: { id: 52 } });
    expect(row?.firstname).toBe("Novak");
    expect(row?.rank).toBe(2);
    expect(JSON.parse(row!.last)).toEqual([1, 1, 1, 1, 1]);
  });
});
