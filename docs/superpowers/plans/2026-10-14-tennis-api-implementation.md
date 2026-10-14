# Tennis Head-to-Head API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an Express + TypeScript REST API, backed by SQLite via Prisma, with full CRUD on tennis players and three computed KPI endpoints, seeded from `headtohead.json`.

**Architecture:** Layered `routes → controllers → services → Prisma client`. Services hold all business logic (CRUD and KPI math) with no Express types, so they're unit-testable in isolation. A pure mapper module converts between the DB's flat row shape and the API's nested JSON shape in both directions.

**Tech Stack:** Node.js, TypeScript, Express, Prisma + SQLite, zod, Jest + Supertest (ts-jest).

**Spec:** `docs/superpowers/specs/2026-10-14-tennis-api-design.md`

## Global Constraints

- Node.js >= 18.
- `id` is the client-supplied source-of-truth primary key — no autoincrement (source data's ids are non-contiguous: 52, 95, 65, 102, 17).
- `last` is stored as a JSON-encoded string column; semantics: `1` = won that game, `0` = lost. No fixed array length is enforced.
- BMI formula: `weight(kg) / height(m)²`, where DB `weight` is grams and `height` is centimeters.
- All three KPI endpoints return HTTP 200 with `{ "result": null }` when there are zero players, never an error.
- `sex` is restricted to `"M" | "F" | "NC"`; `picture` and `country.picture` must be URLs ending in `.png`, `.jpg`, `.jpeg`, or `.webp`; `data.last` entries must each be exactly `0` or `1`.
- No authentication, no pagination/filtering/sorting, no KPIs beyond the three listed, no frontend — all explicitly out of scope per the spec.

## Review Focus

- Non-numeric `:id` path param (e.g. `GET /players/abc`) must return 400, not a 500 from a bad query. (Task 4: `idParamSchema` unit test; Task 7: route-level 400 test.)
- Duplicate `id` on `POST /players` must return 409, not a raw Prisma unique-constraint crash. (Task 6 service test; Task 7 route test.)
- `data.last` entries outside `{0, 1}` (e.g. `2`, `-1`, `0.5`) must be rejected by validation before they can corrupt KPI math. (Task 4 schema test.)
- Zero players in the DB must make every KPI endpoint return `{ "result": null }` with 200, not throw or divide by zero. (Task 8 service tests; Task 9 route tests.)
- A tie in country win-ratio between two or more countries must resolve deterministically (alphabetically first country code), not depend on DB row order. (Task 8 service test.)

---

### Task 1: Project scaffolding, tooling, and health check

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `jest.config.js`
- Create: `.gitignore`
- Create: `README.md`
- Create: `src/app.ts`
- Create: `src/server.ts`
- Test: `tests/health.test.ts`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: `app` (Express application instance), exported from `src/app.ts`, consumed by every later task that adds routes or writes a route-level test.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "tennis-headtohead-api",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "build": "tsc",
    "start": "node dist/server.js",
    "dev": "ts-node src/server.ts",
    "test": "jest",
    "prisma:migrate": "prisma migrate dev",
    "prisma:generate": "prisma generate",
    "db:seed": "ts-node prisma/seed.ts"
  },
  "prisma": {
    "seed": "ts-node prisma/seed.ts"
  }
}
```

- [ ] **Step 2: Install dependencies**

Run:
```bash
npm install express @prisma/client zod
npm install -D typescript ts-node @types/node @types/express prisma jest ts-jest @types/jest supertest @types/supertest dotenv
```
Expected: both commands exit 0; `node_modules/` and `package-lock.json` appear.

- [ ] **Step 3: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "outDir": "dist",
    "rootDir": ".",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true
  },
  "include": ["src", "prisma", "tests"]
}
```

- [ ] **Step 4: Create `jest.config.js`**

```js
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["**/tests/**/*.test.ts"],
};
```

- [ ] **Step 5: Create `.gitignore`**

```
node_modules/
dist/
*.db
*.db-journal
.env
```

- [ ] **Step 6: Write the failing test**

Create `tests/health.test.ts`:

```ts
import request from "supertest";
import { app } from "../src/app";

describe("GET /health", () => {
  it("returns 200 with status ok", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });
});
```

- [ ] **Step 7: Run test to verify it fails**

Run: `npx jest tests/health.test.ts`
Expected: FAIL — `Cannot find module '../src/app'`

- [ ] **Step 8: Write minimal implementation**

Create `src/app.ts`:

```ts
import express from "express";

export const app = express();

app.use(express.json());

app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});
```

Create `src/server.ts`:

```ts
import { app } from "./app";

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
```

- [ ] **Step 9: Run test to verify it passes**

Run: `npx jest tests/health.test.ts`
Expected: PASS

- [ ] **Step 10: Write the README**

Create `README.md`:

```markdown
# Tennis Head-to-Head API

A REST API over a small tennis player dataset. Full CRUD on players,
plus a few computed KPIs. Built with Express, TypeScript, Prisma,
SQLite, and zod.

## Setup

\`\`\`bash
npm install
cp .env.example .env
npx prisma migrate dev
npm run db:seed
\`\`\`

## Development

\`\`\`bash
npm run dev      # start the API with ts-node
npm run build    # compile to dist/
npm start         # run the compiled build
npm test          # run the Jest test suite
\`\`\`

## Endpoints

- `GET /players` — list all players
- `GET /players/:id` — get one player
- `POST /players` — create a player
- `PUT /players/:id` — update a player
- `DELETE /players/:id` — delete a player
- `GET /kpis/best-country` — country with the best aggregate win ratio
- `GET /kpis/average-bmi` — average BMI across all players
- `GET /kpis/median-height` — median player height
```

- [ ] **Step 11: Commit**

```bash
git add package.json package-lock.json tsconfig.json jest.config.js .gitignore README.md src/app.ts src/server.ts tests/health.test.ts
git commit -m "Scaffold Express/TypeScript project with health check"
```

---

### Task 2: Prisma schema, client singleton, and test DB infrastructure

**Files:**
- Create: `prisma/schema.prisma`
- Create: `.env`
- Create: `.env.example`
- Create: `.env.test`
- Create: `src/lib/prisma.ts`
- Modify: `jest.config.js`
- Create: `tests/jest.setup.js`
- Create: `tests/jest.global-setup.js`
- Test: `tests/prisma-schema.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `prisma` (PrismaClient singleton), exported from `src/lib/prisma.ts`, consumed by every later task that touches the database. The generated Prisma `Player` model has fields: `id, firstname, lastname, shortname, sex, countryCode, countryPicture, picture, rank, points, weight, height, age, last` (all `Int` except the `String` fields: `firstname, lastname, shortname, sex, countryCode, countryPicture, picture, last`).

- [ ] **Step 1: Create the Prisma schema**

Create `prisma/schema.prisma`:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

model Player {
  id             Int    @id
  firstname      String
  lastname       String
  shortname      String
  sex            String
  countryCode    String
  countryPicture String
  picture        String
  rank           Int
  points         Int
  weight         Int
  height         Int
  age            Int
  last           String
}
```

- [ ] **Step 2: Create env files**

Create `.env`:
```
DATABASE_URL="file:./dev.db"
```

Create `.env.example`:
```
DATABASE_URL="file:./dev.db"
```

Create `.env.test` (committed — it holds no secrets, only the test DB file path):
```
DATABASE_URL="file:./prisma/test.db"
```

- [ ] **Step 3: Run the initial migration**

Run: `npx prisma migrate dev --name init`
Expected: creates `prisma/migrations/<timestamp>_init/migration.sql`, creates `dev.db`, generates the Prisma Client. Exit 0.

- [ ] **Step 4: Wire Jest to the test database**

Modify `jest.config.js` to add setup hooks:

```js
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["**/tests/**/*.test.ts"],
  setupFiles: ["<rootDir>/tests/jest.setup.js"],
  globalSetup: "<rootDir>/tests/jest.global-setup.js",
};
```

Create `tests/jest.setup.js`:

```js
const dotenv = require("dotenv");
dotenv.config({ path: ".env.test" });
```

Create `tests/jest.global-setup.js`:

```js
const { execSync } = require("child_process");
const dotenv = require("dotenv");

module.exports = async () => {
  dotenv.config({ path: ".env.test" });
  execSync("npx prisma db push --skip-generate --accept-data-loss", {
    env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL },
    stdio: "inherit",
  });
};
```

- [ ] **Step 5: Write the failing test**

Create `tests/prisma-schema.test.ts`:

```ts
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
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npx jest tests/prisma-schema.test.ts`
Expected: FAIL — `Cannot find module '../src/lib/prisma'`

- [ ] **Step 7: Write minimal implementation**

Create `src/lib/prisma.ts`:

```ts
import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npx jest tests/prisma-schema.test.ts`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add prisma/schema.prisma prisma/migrations .env.example .env.test src/lib/prisma.ts jest.config.js tests/jest.setup.js tests/jest.global-setup.js tests/prisma-schema.test.ts
git commit -m "Add Prisma schema, client singleton, and test DB wiring"
```

(`.env` and `dev.db` are gitignored and intentionally not committed.)

---

### Task 3: Player type and DB/API shape mapper

**Files:**
- Create: `src/types/player.ts`
- Create: `src/mappers/player.mapper.ts`
- Test: `tests/player.mapper.test.ts`

**Interfaces:**
- Consumes: Prisma `Player` row shape from Task 2.
- Produces: `Player`, `Country`, `PlayerData`, `Sex` types from `src/types/player.ts`; `toDbRow(player: Player): PrismaPlayerRow` and `toApiShape(row: PrismaPlayerRow): Player` from `src/mappers/player.mapper.ts`. Both consumed by Task 5 (seed), Task 6 (players service).

- [ ] **Step 1: Create the API types**

Create `src/types/player.ts`:

```ts
export type Sex = "M" | "F" | "NC";

export interface Country {
  picture: string;
  code: string;
}

export interface PlayerData {
  rank: number;
  points: number;
  weight: number;
  height: number;
  age: number;
  last: number[];
}

export interface Player {
  id: number;
  firstname: string;
  lastname: string;
  shortname: string;
  sex: Sex;
  country: Country;
  picture: string;
  data: PlayerData;
}
```

- [ ] **Step 2: Write the failing test**

Create `tests/player.mapper.test.ts`:

```ts
import { toApiShape, toDbRow } from "../src/mappers/player.mapper";
import type { Player } from "../src/types/player";

const djokovic: Player = {
  id: 52,
  firstname: "Novak",
  lastname: "Djokovic",
  shortname: "N.DJO",
  sex: "M",
  country: { picture: "https://tenisu.latelier.co/resources/Serbie.png", code: "SRB" },
  picture: "https://tenisu.latelier.co/resources/Djokovic.png",
  data: { rank: 2, points: 2542, weight: 80000, height: 188, age: 31, last: [1, 1, 1, 1, 1] },
};

describe("player mapper", () => {
  it("toDbRow flattens the nested shape", () => {
    expect(toDbRow(djokovic)).toEqual({
      id: 52,
      firstname: "Novak",
      lastname: "Djokovic",
      shortname: "N.DJO",
      sex: "M",
      countryCode: "SRB",
      countryPicture: "https://tenisu.latelier.co/resources/Serbie.png",
      picture: "https://tenisu.latelier.co/resources/Djokovic.png",
      rank: 2,
      points: 2542,
      weight: 80000,
      height: 188,
      age: 31,
      last: "[1,1,1,1,1]",
    });
  });

  it("toApiShape round-trips back to the original nested shape", () => {
    expect(toApiShape(toDbRow(djokovic))).toEqual(djokovic);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx jest tests/player.mapper.test.ts`
Expected: FAIL — `Cannot find module '../src/mappers/player.mapper'`

- [ ] **Step 4: Write minimal implementation**

Create `src/mappers/player.mapper.ts`:

```ts
import type { Player as PlayerRecord } from "@prisma/client";
import type { Player } from "../types/player";

export function toDbRow(player: Player): PlayerRecord {
  return {
    id: player.id,
    firstname: player.firstname,
    lastname: player.lastname,
    shortname: player.shortname,
    sex: player.sex,
    countryCode: player.country.code,
    countryPicture: player.country.picture,
    picture: player.picture,
    rank: player.data.rank,
    points: player.data.points,
    weight: player.data.weight,
    height: player.data.height,
    age: player.data.age,
    last: JSON.stringify(player.data.last),
  };
}

export function toApiShape(row: PlayerRecord): Player {
  return {
    id: row.id,
    firstname: row.firstname,
    lastname: row.lastname,
    shortname: row.shortname,
    sex: row.sex as Player["sex"],
    country: { code: row.countryCode, picture: row.countryPicture },
    picture: row.picture,
    data: {
      rank: row.rank,
      points: row.points,
      weight: row.weight,
      height: row.height,
      age: row.age,
      last: JSON.parse(row.last) as number[],
    },
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx jest tests/player.mapper.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/types/player.ts src/mappers/player.mapper.ts tests/player.mapper.test.ts
git commit -m "Add Player type and DB/API shape mapper"
```

---

### Task 4: Validation schemas and error-handling infrastructure

**Files:**
- Create: `src/errors.ts`
- Create: `src/schemas/player.schema.ts`
- Create: `src/middleware/async-handler.ts`
- Create: `src/middleware/error-handler.ts`
- Test: `tests/player.schema.test.ts`
- Test: `tests/error-handler.test.ts`

**Interfaces:**
- Consumes: `Player` type from Task 3.
- Produces: `NotFoundError`, `ConflictError` (from `src/errors.ts`); `playerSchema`, `idParamSchema` (from `src/schemas/player.schema.ts`); `asyncHandler` (from `src/middleware/async-handler.ts`); `errorHandler` Express middleware (from `src/middleware/error-handler.ts`). All four are consumed by Task 6 (service errors), Task 7 (players routes/controllers), Task 9 (kpis routes).

- [ ] **Step 1: Write the failing schema test**

Create `tests/player.schema.test.ts`:

```ts
import { playerSchema, idParamSchema } from "../src/schemas/player.schema";

const validPlayer = {
  id: 1,
  firstname: "Test",
  lastname: "Player",
  shortname: "T.PLA",
  sex: "M",
  country: { picture: "https://example.com/fra.png", code: "FRA" },
  picture: "https://example.com/test.jpg",
  data: { rank: 1, points: 100, weight: 80000, height: 180, age: 25, last: [1, 0, 1] },
};

describe("playerSchema", () => {
  it("accepts a valid player", () => {
    expect(() => playerSchema.parse(validPlayer)).not.toThrow();
  });

  it("rejects an invalid sex value", () => {
    expect(() => playerSchema.parse({ ...validPlayer, sex: "X" })).toThrow();
  });

  it("rejects a picture URL without a recognized image extension", () => {
    expect(() =>
      playerSchema.parse({ ...validPlayer, picture: "https://example.com/test.exe" })
    ).toThrow();
  });

  it("rejects a country picture URL without a recognized image extension", () => {
    expect(() =>
      playerSchema.parse({
        ...validPlayer,
        country: { ...validPlayer.country, picture: "https://example.com/fra.txt" },
      })
    ).toThrow();
  });

  it("rejects a last array containing a value other than 0 or 1", () => {
    expect(() =>
      playerSchema.parse({ ...validPlayer, data: { ...validPlayer.data, last: [1, 0, 2] } })
    ).toThrow();
  });
});

describe("idParamSchema", () => {
  it("parses a numeric string id", () => {
    expect(idParamSchema.parse("52")).toBe(52);
  });

  it("rejects a non-numeric id", () => {
    expect(() => idParamSchema.parse("abc")).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/player.schema.test.ts`
Expected: FAIL — `Cannot find module '../src/schemas/player.schema'`

- [ ] **Step 3: Write minimal implementation**

Create `src/schemas/player.schema.ts`:

```ts
import { z } from "zod";

const imageUrlRegex = /^https?:\/\/.+\.(png|jpe?g|webp)$/i;

export const countrySchema = z.object({
  picture: z.string().regex(imageUrlRegex, "must be a valid image URL (png, jpg, jpeg, webp)"),
  code: z.string().min(1),
});

export const playerDataSchema = z.object({
  rank: z.number().int().positive(),
  points: z.number().int().positive(),
  weight: z.number().int().positive(),
  height: z.number().int().positive(),
  age: z.number().int().positive(),
  last: z
    .array(z.number().int().refine((n) => n === 0 || n === 1, "must be 0 or 1"))
    .min(1),
});

export const playerSchema = z.object({
  id: z.number().int().positive(),
  firstname: z.string().min(1),
  lastname: z.string().min(1),
  shortname: z.string().min(1),
  sex: z.enum(["M", "F", "NC"]),
  country: countrySchema,
  picture: z.string().regex(imageUrlRegex, "must be a valid image URL (png, jpg, jpeg, webp)"),
  data: playerDataSchema,
});

export const idParamSchema = z.coerce.number().int().positive();

export type PlayerInput = z.infer<typeof playerSchema>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/player.schema.test.ts`
Expected: PASS

- [ ] **Step 5: Create the error classes**

Create `src/errors.ts`:

```ts
export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}

export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConflictError";
  }
}
```

- [ ] **Step 6: Write the failing error-handler test**

Create `tests/error-handler.test.ts`:

```ts
import express from "express";
import request from "supertest";
import { z } from "zod";
import { errorHandler } from "../src/middleware/error-handler";
import { asyncHandler } from "../src/middleware/async-handler";
import { NotFoundError, ConflictError } from "../src/errors";

function buildTestApp() {
  const app = express();

  app.get(
    "/validation-error",
    asyncHandler(async () => {
      z.object({ x: z.string() }).parse({ x: 1 });
    })
  );
  app.get(
    "/not-found",
    asyncHandler(async () => {
      throw new NotFoundError("player 1 not found");
    })
  );
  app.get(
    "/conflict",
    asyncHandler(async () => {
      throw new ConflictError("player 1 already exists");
    })
  );
  app.get(
    "/boom",
    asyncHandler(async () => {
      throw new Error("unexpected");
    })
  );

  app.use(errorHandler);
  return app;
}

describe("errorHandler", () => {
  const app = buildTestApp();

  it("maps ZodError to 400", async () => {
    const res = await request(app).get("/validation-error");
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("ValidationError");
  });

  it("maps NotFoundError to 404", async () => {
    const res = await request(app).get("/not-found");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "NotFound", message: "player 1 not found" });
  });

  it("maps ConflictError to 409", async () => {
    const res = await request(app).get("/conflict");
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: "Conflict", message: "player 1 already exists" });
  });

  it("maps unexpected errors to 500", async () => {
    const res = await request(app).get("/boom");
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "InternalError" });
  });
});
```

- [ ] **Step 7: Run test to verify it fails**

Run: `npx jest tests/error-handler.test.ts`
Expected: FAIL — `Cannot find module '../src/middleware/error-handler'`

- [ ] **Step 8: Write minimal implementation**

Create `src/middleware/async-handler.ts`:

```ts
import type { Request, Response, NextFunction, RequestHandler } from "express";

export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}
```

Create `src/middleware/error-handler.ts`:

```ts
import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { NotFoundError, ConflictError } from "../errors";

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    res.status(400).json({ error: "ValidationError", details: err.issues });
    return;
  }
  if (err instanceof NotFoundError) {
    res.status(404).json({ error: "NotFound", message: err.message });
    return;
  }
  if (err instanceof ConflictError) {
    res.status(409).json({ error: "Conflict", message: err.message });
    return;
  }
  console.error(err);
  res.status(500).json({ error: "InternalError" });
};
```

- [ ] **Step 9: Run test to verify it passes**

Run: `npx jest tests/error-handler.test.ts`
Expected: PASS

- [ ] **Step 10: Run the full test suite**

Run: `npx jest`
Expected: all suites PASS.

- [ ] **Step 11: Commit**

```bash
git add src/errors.ts src/schemas/player.schema.ts src/middleware/async-handler.ts src/middleware/error-handler.ts tests/player.schema.test.ts tests/error-handler.test.ts
git commit -m "Add validation schemas and error-handling middleware"
```

---

### Task 5: Seed script

**Files:**
- Create: `prisma/seed.ts`
- Test: `tests/seed.test.ts`

**Interfaces:**
- Consumes: `toDbRow` from Task 3, `prisma` from Task 2.
- Produces: `seedDatabase(prisma: PrismaClient, jsonPath: string): Promise<void>`, exported from `prisma/seed.ts`. Not consumed by later tasks directly, but `npm run db:seed` (Task 1 script) invokes this file's CLI entry point.

- [ ] **Step 1: Write the failing test**

Create `tests/seed.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/seed.test.ts`
Expected: FAIL — `Cannot find module '../prisma/seed'`

- [ ] **Step 3: Write minimal implementation**

Create `prisma/seed.ts`:

```ts
import { readFileSync } from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";
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
  const prisma = new PrismaClient();
  seedDatabase(prisma, path.join(__dirname, "..", "headtohead.json"))
    .then(() => prisma.$disconnect())
    .catch(async (err) => {
      console.error(err);
      await prisma.$disconnect();
      process.exit(1);
    });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/seed.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add prisma/seed.ts tests/seed.test.ts
git commit -m "Add seed script to load headtohead.json into the database"
```

---

### Task 6: Players service (CRUD)

**Files:**
- Create: `src/services/players.service.ts`
- Test: `tests/players.service.test.ts`

**Interfaces:**
- Consumes: `prisma` (Task 2), `toApiShape`/`toDbRow` (Task 3), `NotFoundError`/`ConflictError` (Task 4), `Player` type (Task 3).
- Produces: `listPlayers(): Promise<Player[]>`, `getPlayer(id: number): Promise<Player>`, `createPlayer(input: Player): Promise<Player>`, `updatePlayer(id: number, input: Player): Promise<Player>`, `deletePlayer(id: number): Promise<void>` from `src/services/players.service.ts`. Consumed by Task 7 (players controller). Note: `updatePlayer` always uses the path `id`, ignoring any `id` present in `input`.

- [ ] **Step 1: Write the failing test**

Create `tests/players.service.test.ts`:

```ts
import { prisma } from "../src/lib/prisma";
import * as playersService from "../src/services/players.service";
import { NotFoundError, ConflictError } from "../src/errors";
import type { Player } from "../src/types/player";

const fixture: Player = {
  id: 1,
  firstname: "Test",
  lastname: "Player",
  shortname: "T.PLA",
  sex: "M",
  country: { picture: "https://example.com/fra.png", code: "FRA" },
  picture: "https://example.com/test.png",
  data: { rank: 1, points: 100, weight: 80000, height: 180, age: 25, last: [1, 0, 1] },
};

describe("players.service", () => {
  beforeEach(async () => {
    await prisma.player.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("creates and lists a player", async () => {
    await playersService.createPlayer(fixture);
    const players = await playersService.listPlayers();
    expect(players).toEqual([fixture]);
  });

  it("gets a player by id", async () => {
    await playersService.createPlayer(fixture);
    const player = await playersService.getPlayer(1);
    expect(player).toEqual(fixture);
  });

  it("throws NotFoundError for a missing id on get", async () => {
    await expect(playersService.getPlayer(999)).rejects.toThrow(NotFoundError);
  });

  it("throws ConflictError when creating a duplicate id", async () => {
    await playersService.createPlayer(fixture);
    await expect(playersService.createPlayer(fixture)).rejects.toThrow(ConflictError);
  });

  it("updates a player", async () => {
    await playersService.createPlayer(fixture);
    const updated = await playersService.updatePlayer(1, { ...fixture, firstname: "Changed" });
    expect(updated.firstname).toBe("Changed");
    expect(updated.id).toBe(1);
  });

  it("throws NotFoundError when updating a missing id", async () => {
    await expect(playersService.updatePlayer(999, fixture)).rejects.toThrow(NotFoundError);
  });

  it("deletes a player", async () => {
    await playersService.createPlayer(fixture);
    await playersService.deletePlayer(1);
    await expect(playersService.getPlayer(1)).rejects.toThrow(NotFoundError);
  });

  it("throws NotFoundError when deleting a missing id", async () => {
    await expect(playersService.deletePlayer(999)).rejects.toThrow(NotFoundError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/players.service.test.ts`
Expected: FAIL — `Cannot find module '../src/services/players.service'`

- [ ] **Step 3: Write minimal implementation**

Create `src/services/players.service.ts`:

```ts
import { prisma } from "../lib/prisma";
import { toApiShape, toDbRow } from "../mappers/player.mapper";
import { NotFoundError, ConflictError } from "../errors";
import type { Player } from "../types/player";

export async function listPlayers(): Promise<Player[]> {
  const rows = await prisma.player.findMany();
  return rows.map(toApiShape);
}

export async function getPlayer(id: number): Promise<Player> {
  const row = await prisma.player.findUnique({ where: { id } });
  if (!row) throw new NotFoundError(`player ${id} not found`);
  return toApiShape(row);
}

export async function createPlayer(input: Player): Promise<Player> {
  const existing = await prisma.player.findUnique({ where: { id: input.id } });
  if (existing) throw new ConflictError(`player ${input.id} already exists`);
  const row = await prisma.player.create({ data: toDbRow(input) });
  return toApiShape(row);
}

export async function updatePlayer(id: number, input: Player): Promise<Player> {
  const existing = await prisma.player.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError(`player ${id} not found`);
  const row = await prisma.player.update({ where: { id }, data: toDbRow({ ...input, id }) });
  return toApiShape(row);
}

export async function deletePlayer(id: number): Promise<void> {
  const existing = await prisma.player.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError(`player ${id} not found`);
  await prisma.player.delete({ where: { id } });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/players.service.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/players.service.ts tests/players.service.test.ts
git commit -m "Add players service with full CRUD"
```

---

### Task 7: Players routes and controllers

**Files:**
- Create: `src/controllers/players.controller.ts`
- Create: `src/routes/players.routes.ts`
- Modify: `src/app.ts`
- Test: `tests/players.routes.test.ts`

**Interfaces:**
- Consumes: `playersService` (Task 6), `playerSchema`/`idParamSchema` (Task 4), `asyncHandler`/`errorHandler` (Task 4), `app` (Task 1).
- Produces: `playersRouter` (Express Router) from `src/routes/players.routes.ts`, mounted at `/players` in `src/app.ts`. `errorHandler` is mounted as the last middleware. Consumed by Task 9 (kpis routes modify the same `app.ts`).

- [ ] **Step 1: Write the failing test**

Create `tests/players.routes.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/players.routes.test.ts`
Expected: FAIL — 404s from the app, since `/players` isn't mounted yet.

- [ ] **Step 3: Write minimal implementation**

Create `src/controllers/players.controller.ts`:

```ts
import type { Request, Response } from "express";
import { playerSchema, idParamSchema } from "../schemas/player.schema";
import * as playersService from "../services/players.service";

export async function list(_req: Request, res: Response): Promise<void> {
  const players = await playersService.listPlayers();
  res.status(200).json(players);
}

export async function getById(req: Request, res: Response): Promise<void> {
  const id = idParamSchema.parse(req.params.id);
  const player = await playersService.getPlayer(id);
  res.status(200).json(player);
}

export async function create(req: Request, res: Response): Promise<void> {
  const input = playerSchema.parse(req.body);
  const player = await playersService.createPlayer(input);
  res.status(201).json(player);
}

export async function update(req: Request, res: Response): Promise<void> {
  const id = idParamSchema.parse(req.params.id);
  const input = playerSchema.parse(req.body);
  const player = await playersService.updatePlayer(id, input);
  res.status(200).json(player);
}

export async function remove(req: Request, res: Response): Promise<void> {
  const id = idParamSchema.parse(req.params.id);
  await playersService.deletePlayer(id);
  res.status(204).send();
}
```

Create `src/routes/players.routes.ts`:

```ts
import { Router } from "express";
import { asyncHandler } from "../middleware/async-handler";
import * as controller from "../controllers/players.controller";

export const playersRouter = Router();

playersRouter.get("/", asyncHandler(controller.list));
playersRouter.get("/:id", asyncHandler(controller.getById));
playersRouter.post("/", asyncHandler(controller.create));
playersRouter.put("/:id", asyncHandler(controller.update));
playersRouter.delete("/:id", asyncHandler(controller.remove));
```

Modify `src/app.ts`:

```ts
import express from "express";
import { playersRouter } from "./routes/players.routes";
import { errorHandler } from "./middleware/error-handler";

export const app = express();

app.use(express.json());

app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

app.use("/players", playersRouter);

app.use(errorHandler);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/players.routes.test.ts`
Expected: PASS

- [ ] **Step 5: Run the full test suite**

Run: `npx jest`
Expected: all suites PASS.

- [ ] **Step 6: Commit**

```bash
git add src/controllers/players.controller.ts src/routes/players.routes.ts src/app.ts tests/players.routes.test.ts
git commit -m "Add players routes and controllers"
```

---

### Task 8: KPI service

**Files:**
- Create: `src/services/kpis.service.ts`
- Test: `tests/kpis.service.test.ts`

**Interfaces:**
- Consumes: `prisma` (Task 2).
- Produces: `BestCountryResult` type, `getBestCountry(): Promise<BestCountryResult | null>`, `getAverageBmi(): Promise<number | null>`, `getMedianHeight(): Promise<number | null>` from `src/services/kpis.service.ts`. Consumed by Task 9 (kpis controller).

- [ ] **Step 1: Write the failing test**

Create `tests/kpis.service.test.ts`:

```ts
import { prisma } from "../src/lib/prisma";
import * as kpisService from "../src/services/kpis.service";

async function insertPlayer(overrides: Partial<{
  id: number;
  countryCode: string;
  height: number;
  weight: number;
  last: number[];
}>) {
  const id = overrides.id ?? 1;
  await prisma.player.create({
    data: {
      id,
      firstname: `P${id}`,
      lastname: "Test",
      shortname: `P${id}.T`,
      sex: "M",
      countryCode: overrides.countryCode ?? "FRA",
      countryPicture: "https://example.com/fra.png",
      picture: "https://example.com/test.png",
      rank: 1,
      points: 100,
      weight: overrides.weight ?? 70000,
      height: overrides.height ?? 180,
      age: 25,
      last: JSON.stringify(overrides.last ?? [1, 0]),
    },
  });
}

describe("kpis.service", () => {
  beforeEach(async () => {
    await prisma.player.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe("getBestCountry", () => {
    it("returns null when there are no players", async () => {
      expect(await kpisService.getBestCountry()).toBeNull();
    });

    it("picks the country with the clear best win ratio", async () => {
      await insertPlayer({ id: 1, countryCode: "AAA", last: [1, 1] });
      await insertPlayer({ id: 2, countryCode: "BBB", last: [0, 0] });
      expect(await kpisService.getBestCountry()).toEqual({ code: "AAA", ratio: 1 });
    });

    it("breaks a tie alphabetically by country code", async () => {
      await insertPlayer({ id: 1, countryCode: "BBB", last: [1, 0] });
      await insertPlayer({ id: 2, countryCode: "AAA", last: [1, 0] });
      expect(await kpisService.getBestCountry()).toEqual({ code: "AAA", ratio: 0.5 });
    });
  });

  describe("getAverageBmi", () => {
    it("returns null when there are no players", async () => {
      expect(await kpisService.getAverageBmi()).toBeNull();
    });

    it("computes the average BMI across all players", async () => {
      await insertPlayer({ id: 1, weight: 70000, height: 175 });
      await insertPlayer({ id: 2, weight: 80000, height: 160 });
      const result = await kpisService.getAverageBmi();
      expect(result).toBeCloseTo(27.0536, 3);
    });
  });

  describe("getMedianHeight", () => {
    it("returns null when there are no players", async () => {
      expect(await kpisService.getMedianHeight()).toBeNull();
    });

    it("computes the median for an odd number of players", async () => {
      await insertPlayer({ id: 1, height: 170 });
      await insertPlayer({ id: 2, height: 190 });
      await insertPlayer({ id: 3, height: 180 });
      expect(await kpisService.getMedianHeight()).toBe(180);
    });

    it("computes the median for an even number of players", async () => {
      await insertPlayer({ id: 1, height: 170 });
      await insertPlayer({ id: 2, height: 180 });
      await insertPlayer({ id: 3, height: 190 });
      await insertPlayer({ id: 4, height: 200 });
      expect(await kpisService.getMedianHeight()).toBe(185);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/kpis.service.test.ts`
Expected: FAIL — `Cannot find module '../src/services/kpis.service'`

- [ ] **Step 3: Write minimal implementation**

Create `src/services/kpis.service.ts`:

```ts
import { prisma } from "../lib/prisma";

export interface BestCountryResult {
  code: string;
  ratio: number;
}

export async function getBestCountry(): Promise<BestCountryResult | null> {
  const rows = await prisma.player.findMany();
  if (rows.length === 0) return null;

  const byCountry = new Map<string, { wins: number; games: number }>();
  for (const row of rows) {
    const last = JSON.parse(row.last) as number[];
    const wins = last.filter((v) => v === 1).length;
    const games = last.length;
    const entry = byCountry.get(row.countryCode) ?? { wins: 0, games: 0 };
    entry.wins += wins;
    entry.games += games;
    byCountry.set(row.countryCode, entry);
  }

  const sortedCodes = [...byCountry.keys()].sort((a, b) => a.localeCompare(b));

  let best: BestCountryResult | null = null;
  for (const code of sortedCodes) {
    const { wins, games } = byCountry.get(code)!;
    const ratio = games === 0 ? 0 : wins / games;
    if (best === null || ratio > best.ratio) {
      best = { code, ratio };
    }
  }
  return best;
}

export async function getAverageBmi(): Promise<number | null> {
  const rows = await prisma.player.findMany();
  if (rows.length === 0) return null;

  const total = rows.reduce((sum, row) => {
    const weightKg = row.weight / 1000;
    const heightM = row.height / 100;
    return sum + weightKg / (heightM * heightM);
  }, 0);

  return total / rows.length;
}

export async function getMedianHeight(): Promise<number | null> {
  const rows = await prisma.player.findMany();
  if (rows.length === 0) return null;

  const heights = rows.map((row) => row.height).sort((a, b) => a - b);
  const mid = Math.floor(heights.length / 2);
  if (heights.length % 2 === 0) {
    return (heights[mid - 1] + heights[mid]) / 2;
  }
  return heights[mid];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/kpis.service.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/kpis.service.ts tests/kpis.service.test.ts
git commit -m "Add KPI service: best country, average BMI, median height"
```

---

### Task 9: KPI routes and controllers

**Files:**
- Create: `src/controllers/kpis.controller.ts`
- Create: `src/routes/kpis.routes.ts`
- Modify: `src/app.ts`
- Test: `tests/kpis.routes.test.ts`

**Interfaces:**
- Consumes: `kpisService` (Task 8), `asyncHandler` (Task 4), `app`/`playersRouter`/`errorHandler` wiring (Task 7).
- Produces: `kpisRouter` (Express Router), mounted at `/kpis` in `src/app.ts`, before `errorHandler`. Final task — no later task consumes this.

- [ ] **Step 1: Write the failing test**

Create `tests/kpis.routes.test.ts`:

```ts
import request from "supertest";
import { app } from "../src/app";
import { prisma } from "../src/lib/prisma";

async function insertPlayer(id: number, countryCode: string, height: number, weight: number, last: number[]) {
  await prisma.player.create({
    data: {
      id,
      firstname: `P${id}`,
      lastname: "Test",
      shortname: `P${id}.T`,
      sex: "M",
      countryCode,
      countryPicture: "https://example.com/fra.png",
      picture: "https://example.com/test.png",
      rank: 1,
      points: 100,
      weight,
      height,
      age: 25,
      last: JSON.stringify(last),
    },
  });
}

describe("kpis routes", () => {
  beforeEach(async () => {
    await prisma.player.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("GET /kpis/best-country returns null with no players", async () => {
    const res = await request(app).get("/kpis/best-country");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ result: null });
  });

  it("GET /kpis/best-country returns the winning country", async () => {
    await insertPlayer(1, "AAA", 180, 70000, [1, 1]);
    await insertPlayer(2, "BBB", 180, 70000, [0, 0]);
    const res = await request(app).get("/kpis/best-country");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ result: { code: "AAA", ratio: 1 } });
  });

  it("GET /kpis/average-bmi returns null with no players", async () => {
    const res = await request(app).get("/kpis/average-bmi");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ result: null });
  });

  it("GET /kpis/average-bmi returns the computed average", async () => {
    await insertPlayer(1, "AAA", 175, 70000, [1]);
    await insertPlayer(2, "BBB", 160, 80000, [1]);
    const res = await request(app).get("/kpis/average-bmi");
    expect(res.status).toBe(200);
    expect(res.body.result).toBeCloseTo(27.0536, 3);
  });

  it("GET /kpis/median-height returns null with no players", async () => {
    const res = await request(app).get("/kpis/median-height");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ result: null });
  });

  it("GET /kpis/median-height returns the median", async () => {
    await insertPlayer(1, "AAA", 170, 70000, [1]);
    await insertPlayer(2, "BBB", 180, 70000, [1]);
    await insertPlayer(3, "CCC", 190, 70000, [1]);
    const res = await request(app).get("/kpis/median-height");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ result: 180 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/kpis.routes.test.ts`
Expected: FAIL — 404s from the app, since `/kpis` isn't mounted yet.

- [ ] **Step 3: Write minimal implementation**

Create `src/controllers/kpis.controller.ts`:

```ts
import type { Request, Response } from "express";
import * as kpisService from "../services/kpis.service";

export async function bestCountry(_req: Request, res: Response): Promise<void> {
  const result = await kpisService.getBestCountry();
  res.status(200).json({ result });
}

export async function averageBmi(_req: Request, res: Response): Promise<void> {
  const result = await kpisService.getAverageBmi();
  res.status(200).json({ result });
}

export async function medianHeight(_req: Request, res: Response): Promise<void> {
  const result = await kpisService.getMedianHeight();
  res.status(200).json({ result });
}
```

Create `src/routes/kpis.routes.ts`:

```ts
import { Router } from "express";
import { asyncHandler } from "../middleware/async-handler";
import * as controller from "../controllers/kpis.controller";

export const kpisRouter = Router();

kpisRouter.get("/best-country", asyncHandler(controller.bestCountry));
kpisRouter.get("/average-bmi", asyncHandler(controller.averageBmi));
kpisRouter.get("/median-height", asyncHandler(controller.medianHeight));
```

Modify `src/app.ts` to mount the new router before the error handler:

```ts
import express from "express";
import { playersRouter } from "./routes/players.routes";
import { kpisRouter } from "./routes/kpis.routes";
import { errorHandler } from "./middleware/error-handler";

export const app = express();

app.use(express.json());

app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

app.use("/players", playersRouter);
app.use("/kpis", kpisRouter);

app.use(errorHandler);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/kpis.routes.test.ts`
Expected: PASS

- [ ] **Step 5: Run the full test suite**

Run: `npx jest`
Expected: all suites PASS.

- [ ] **Step 6: Commit**

```bash
git add src/controllers/kpis.controller.ts src/routes/kpis.routes.ts src/app.ts tests/kpis.routes.test.ts
git commit -m "Add KPI routes and controllers"
```
