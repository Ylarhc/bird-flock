import { prisma } from "../src/lib/prisma";

describe("Prisma Player schema", () => {
  beforeEach(async () => {
    await prisma.player.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("can create and read back a player row", async () => {
    await prisma.player.create({
      data: {
        id: 1,
        firstname: "Test",
        lastname: "Player",
        shortname: "T.PLA",
        sex: "M",
        countryCode: "FRA",
        countryPicture: "https://example.com/fra.png",
        picture: "https://example.com/test.png",
        rank: 1,
        points: 100,
        weight: 80000,
        height: 180,
        age: 25,
        last: "[1,0,1,0,1]",
      },
    });

    const found = await prisma.player.findUnique({ where: { id: 1 } });
    expect(found?.firstname).toBe("Test");
    expect(found?.last).toBe("[1,0,1,0,1]");
  });
});
