const API_BASE_URL = process.env.E2E_API_BASE_URL;

if (!API_BASE_URL) {
  throw new Error(
    "E2E_API_BASE_URL not set — run this suite via `npm run test:e2e`, not jest directly"
  );
}

describe("tennis API (e2e, real Lambda + API Gateway via Floci)", () => {
  const testPlayer = {
    id: 9001,
    firstname: "E2E",
    lastname: "Test",
    shortname: "E.TES",
    sex: "M",
    country: { picture: "https://example.com/fra.png", code: "FRA" },
    picture: "https://example.com/test.png",
    data: { rank: 1, points: 100, weight: 80000, height: 180, age: 25, last: [1, 0, 1] },
  };

  it("GET /players returns 200 with an array", async () => {
    const res = await fetch(`${API_BASE_URL}/players`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  it("POST /players creates a player, returns 201", async () => {
    const res = await fetch(`${API_BASE_URL}/players`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(testPlayer),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toEqual(testPlayer);
  });

  it("GET /players/:id returns the created player", async () => {
    const res = await fetch(`${API_BASE_URL}/players/${testPlayer.id}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual(testPlayer);
  });

  it("PUT /players/:id updates the player", async () => {
    const updated = { ...testPlayer, firstname: "Changed" };
    const res = await fetch(`${API_BASE_URL}/players/${testPlayer.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(updated),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { firstname: string };
    expect(body.firstname).toBe("Changed");
  });

  it("GET /kpis/best-country returns 200 with a result field", async () => {
    const res = await fetch(`${API_BASE_URL}/kpis/best-country`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("result");
  });

  it("GET /kpis/average-bmi returns 200 with a result field", async () => {
    const res = await fetch(`${API_BASE_URL}/kpis/average-bmi`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("result");
  });

  it("GET /kpis/median-height returns 200 with a result field", async () => {
    const res = await fetch(`${API_BASE_URL}/kpis/median-height`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("result");
  });

  it("GET /kpis returns 200 with all three KPI fields", async () => {
    const res = await fetch(`${API_BASE_URL}/kpis`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("bestCountry");
    expect(body).toHaveProperty("averageBmi");
    expect(body).toHaveProperty("medianHeight");
  });

  it("DELETE /players/:id deletes the player, returns 204", async () => {
    const res = await fetch(`${API_BASE_URL}/players/${testPlayer.id}`, { method: "DELETE" });
    expect(res.status).toBe(204);
  });
});
