import request from "supertest";
import { app } from "../src/app";
import { prisma } from "../src/lib/prisma";

const fixture = {
  id: 1,
  firstname: "Test",
  lastname: "Player",
  shortname: "T.PLA",
  sex: "M",
  country: { picture: "https://example.com/fra.png", code: "FRA" },
  picture: "https://example.com/test.png",
  data: { rank: 1, points: 100, weight: 80000, height: 180, age: 25, last: [1, 0, 1] },
};

describe("players routes", () => {
  beforeEach(async () => {
    await prisma.player.deleteMany();
    await prisma.player.create({
      data: {
        id: fixture.id,
        firstname: fixture.firstname,
        lastname: fixture.lastname,
        shortname: fixture.shortname,
        sex: fixture.sex,
        countryCode: fixture.country.code,
        countryPicture: fixture.country.picture,
        picture: fixture.picture,
        rank: fixture.data.rank,
        points: fixture.data.points,
        weight: fixture.data.weight,
        height: fixture.data.height,
        age: fixture.data.age,
        last: JSON.stringify(fixture.data.last),
      },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("GET /players lists players", async () => {
    const res = await request(app).get("/players");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([fixture]);
  });

  it("GET /players/:id returns a player", async () => {
    const res = await request(app).get("/players/1");
    expect(res.status).toBe(200);
    expect(res.body).toEqual(fixture);
  });

  it("GET /players/:id returns 404 for a missing id", async () => {
    const res = await request(app).get("/players/999");
    expect(res.status).toBe(404);
  });

  it("GET /players/:id returns 400 for a non-numeric id", async () => {
    const res = await request(app).get("/players/abc");
    expect(res.status).toBe(400);
  });

  it("POST /players creates a player", async () => {
    const newPlayer = { ...fixture, id: 2 };
    const res = await request(app).post("/players").send(newPlayer);
    expect(res.status).toBe(201);
    expect(res.body).toEqual(newPlayer);
  });

  it("POST /players returns 400 for an invalid body", async () => {
    const res = await request(app).post("/players").send({ ...fixture, id: 2, sex: "X" });
    expect(res.status).toBe(400);
  });

  it("POST /players returns 409 for a duplicate id", async () => {
    const res = await request(app).post("/players").send(fixture);
    expect(res.status).toBe(409);
  });

  it("PUT /players/:id updates a player", async () => {
    const res = await request(app)
      .put("/players/1")
      .send({ ...fixture, firstname: "Changed" });
    expect(res.status).toBe(200);
    expect(res.body.firstname).toBe("Changed");
  });

  it("PUT /players/:id returns 404 for a missing id", async () => {
    const res = await request(app).put("/players/999").send(fixture);
    expect(res.status).toBe(404);
  });

  it("DELETE /players/:id deletes a player", async () => {
    const res = await request(app).delete("/players/1");
    expect(res.status).toBe(204);
  });

  it("DELETE /players/:id returns 404 for a missing id", async () => {
    const res = await request(app).delete("/players/999");
    expect(res.status).toBe(404);
  });
});
