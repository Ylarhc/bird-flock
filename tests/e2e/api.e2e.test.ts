const API_BASE_URL = process.env.E2E_API_BASE_URL;

if (!API_BASE_URL) {
  throw new Error(
    "E2E_API_BASE_URL not set — run this suite via `npm run test:e2e`, not jest directly"
  );
}

describe("tennis API (e2e, real Lambda + API Gateway via Floci)", () => {
  it("GET /players returns 200 with an array", async () => {
    const res = await fetch(`${API_BASE_URL}/players`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });
});
