# Tennis Head-to-Head API — Design Spec

Date: 2026-10-14

## Purpose

A learning/practice REST API built around the `headtohead.json` tennis
player dataset (data shaped like the `latelier.co` tennis exercise). Goal
is a clean, well-tested Express + TypeScript API with full CRUD on
players, backed by a real database (SQLite via Prisma), plus a small set
of computed KPI endpoints. No frontend is planned; the API is the
deliverable.

## Tech stack

- **Runtime/language:** Node.js + TypeScript
- **HTTP framework:** Express
- **ORM/DB:** Prisma + SQLite (file-based `dev.db`)
- **Validation:** zod
- **Testing:** Jest + Supertest

## Architecture

Layered structure:

```
routes → controllers → services → Prisma client
```

- **Routes** declare paths and HTTP methods, delegate to controllers.
- **Controllers** parse/validate requests (zod), call services, shape
  HTTP responses (status codes, JSON body), map thrown errors to the
  error-handling middleware.
- **Services** hold business logic — CRUD operations against Prisma, and
  KPI computations — with no Express types in their signatures, so they
  are unit-testable in isolation.
- **Prisma client** is instantiated once as a singleton (`src/lib/prisma.ts`)
  and shared across services.

Suggested file layout:

```
prisma/
  schema.prisma
  seed.ts              # reads headtohead.json, populates Player table
src/
  app.ts               # express app wiring (middleware, routes, error handler)
  server.ts            # entry point: app.listen(...)
  lib/
    prisma.ts           # PrismaClient singleton
  routes/
    players.routes.ts
    kpis.routes.ts
  controllers/
    players.controller.ts
    kpis.controller.ts
  services/
    players.service.ts
    kpis.service.ts
  schemas/
    player.schema.ts    # zod schemas for create/update payloads
  types/
    player.ts           # nested API response shape (Player, Country, PlayerData)
  middleware/
    error-handler.ts
tests/
  players.service.test.ts
  players.routes.test.ts
  kpis.service.test.ts
  kpis.routes.test.ts
headtohead.json          # seed source, unchanged
```

## Data model

A single `Player` table. The source JSON's nested shape is flattened for
storage (SQLite has no native nested-object or array type), then
reconstructed into the original nested shape in API responses.

```prisma
model Player {
  id             Int    @id
  firstname      String
  lastname       String
  shortname      String
  sex            String // "M" | "F" | "NC", enforced at the validation layer
  countryCode    String
  countryPicture String
  picture        String
  rank           Int
  points         Int
  weight         Int    // grams
  height         Int    // cm
  age            Int
  last           String // JSON-encoded array of 0/1 ints, e.g. "[1,1,1,0,1]"
}
```

Notes:
- `id` is **not** autoincrement — the source data already assigns ids
  (52, 95, 65, 102, 17), and the seed script preserves them. New players
  created via `POST /players` must supply an `id` (validated as a
  positive integer) or the service generates the next unused integer id
  — see Open Decision below, resolved as: **client-supplied id is
  required**, since there is no natural auto-increment sequence implied
  by the existing data (ids are not contiguous).
- `last` is stored as a JSON string and parsed/serialized at the service
  boundary. Array length is not hardcoded to 5 — validation only
  requires at least one entry, each entry `0` or `1`. This avoids
  overfitting to today's sample data.
- Semantics: `1` = won that game, `0` = lost that game. This is the
  assumption the `best-country` KPI's win-ratio math relies on.

### API response shape (reconstructed nested JSON)

```ts
type Player = {
  id: number;
  firstname: string;
  lastname: string;
  shortname: string;
  sex: "M" | "F" | "NC";
  country: { picture: string; code: string };
  picture: string;
  data: {
    rank: number;
    points: number;
    weight: number;
    height: number;
    age: number;
    last: number[]; // each 0 or 1
  };
};
```

## Validation rules (zod)

Applied on `POST /players` and `PUT /players/:id` request bodies:

- `sex`: enum, one of `"M"`, `"F"`, `"NC"`.
- `picture` and `country.picture`: valid URL whose path ends in a
  recognized image extension — `.png`, `.jpg`, `.jpeg`, or `.webp`
  (case-insensitive).
- `data.last`: array of integers, each strictly `0` or `1` (minimum
  length 1; no upper bound or fixed length enforced).
- `data.rank`, `data.points`, `data.weight`, `data.height`, `data.age`:
  positive integers.
- `id`: positive integer, required on create, and must not already exist
  (checked against the DB — conflict returns 409).
- All string fields (`firstname`, `lastname`, `shortname`,
  `country.code`): non-empty strings.

Validation failures return `400` with a body listing the failing
field(s) and the reason (from zod's error formatting).

## Endpoints

### Players (full CRUD)

| Method | Path            | Description                              | Success | Failure cases |
|--------|-----------------|------------------------------------------|---------|---------------|
| GET    | `/players`      | List all players                         | 200     | —             |
| GET    | `/players/:id`  | Get one player                           | 200     | 404 if not found |
| POST   | `/players`      | Create a player (zod-validated body)     | 201     | 400 invalid body; 409 id already exists |
| PUT    | `/players/:id`  | Full update of a player (zod-validated)  | 200     | 400 invalid body; 404 if not found |
| DELETE | `/players/:id`  | Delete a player                          | 204     | 404 if not found |

### KPIs (read-only, computed from current DB state)

| Method | Path                    | Description |
|--------|-------------------------|--------------|
| GET    | `/kpis/best-country`    | Country code with the highest aggregate win ratio: sum of wins / sum of games across all players sharing that `country.code`. Ties broken by country code (ascending, alphabetical). |
| GET    | `/kpis/average-bmi`     | Average BMI across all players. Per player: `weight(kg) / height(m)²`, i.e. `(weight / 1000) / ((height / 100) ** 2)`. |
| GET    | `/kpis/median-height`   | Median of all players' `height` (average of the two middle values when the count is even). |

Edge case: with zero players in the DB, each KPI endpoint returns `200`
with a `null` result (e.g. `{ "result": null }`) rather than erroring.

## Error handling

Centralized Express error-handling middleware (`src/middleware/error-handler.ts`):

- zod validation errors → `400` with `{ error: "ValidationError", details: [...] }`
- "not found" (thrown by services as a typed `NotFoundError`) → `404`
  with `{ error: "NotFound", message: "..." }`
- "conflict" (duplicate id on create) → `409` with `{ error: "Conflict", message: "..." }`
- anything unexpected → `500` with a generic `{ error: "InternalError" }`
  body (no stack trace leaked to the client; logged server-side)

## Testing

Jest + Supertest, with a seeded test SQLite DB (separate from dev DB,
reset between test runs).

- **Service unit tests** (`players.service.test.ts`, `kpis.service.test.ts`):
  - CRUD: create/read/update/delete happy paths; duplicate id on create;
    update/delete of missing id.
  - KPI math: best-country with a clear winner, a tie, a single
    country only, and an empty DB; average BMI with known inputs
    (hand-computed expected value); median height with both even and
    odd player counts.
- **Route integration tests** (`players.routes.test.ts`, `kpis.routes.test.ts`):
  - Status codes and JSON shapes for every endpoint's happy path and
    documented failure cases (400/404/409).
  - Validation rejections for each new rule: bad `sex` value, malformed
    picture URL/extension, non-binary values in `last`.

## Out of scope (for this iteration)

- Authentication/authorization.
- Pagination/filtering/sorting on `GET /players`.
- Additional KPIs beyond the three listed (more may be added later as a
  follow-up iteration).
- A frontend of any kind.
