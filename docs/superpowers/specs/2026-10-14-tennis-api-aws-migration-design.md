# Tennis Head-to-Head API — AWS Migration Design Spec

Date: 2026-10-14

## Purpose

Migrate the existing tennis head-to-head API (see
`2026-10-14-tennis-api-design.md`) from a long-running Express process
backed by Prisma/SQLite to a serverless deployment on AWS: one Lambda
function per route behind an API Gateway HTTP API, backed by DynamoDB.
This is an infrastructure swap, not a feature change — the same
endpoints, validation rules, and KPI computations are preserved.

## Tech stack changes

| Concern          | Before                        | After                                    |
|-------------------|-------------------------------|-------------------------------------------|
| Compute           | Express process (`server.ts`) | One AWS Lambda function per route        |
| HTTP routing      | Express routes + middleware   | API Gateway HTTP API (v2), Lambda-proxy   |
| Database          | SQLite via Prisma              | DynamoDB                                  |
| IaC / deploy       | n/a                             | Terraform (user runs `terraform apply`)   |
| Local/test DB      | File-based SQLite test DB      | Floci (local AWS emulator) running DynamoDB |

What's unchanged: `types/player.ts`, `schemas/player.schema.ts` (zod
rules), `errors.ts` (`NotFoundError`/`ConflictError`), the
routes→controllers→services-style layering (now
handlers→services→DynamoDB), and all endpoint behavior/response shapes
from the original design spec.

## Architecture

```
HTTP API (API Gateway v2)
  GET    /players           -> listPlayers
  GET    /players/{id}      -> getPlayer
  POST   /players           -> createPlayer
  PUT    /players/{id}      -> updatePlayer
  DELETE /players/{id}      -> deletePlayer
  GET    /kpis              -> kpisAll
  GET    /kpis/best-country -> kpiBestCountry
  GET    /kpis/average-bmi  -> kpiAverageBmi
  GET    /kpis/median-height-> kpiMedianHeight
        │
        ▼
  DynamoDB table: Players (+ CountryIndex, HeightIndex GSIs)
```

Each handler is a thin layer: parse the API Gateway event → validate
with zod → call the service → map the result or thrown error to an API
Gateway proxy response. The only logic duplicated across the 9 handlers
is a `try { ... } catch (err) { return toErrorResponse(err) }` wrapper;
validation, business logic, and response shaping are all shared code.

```ts
export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  try {
    const input = playerSchema.parse(JSON.parse(event.body ?? "{}"));
    const result = await playersService.create(input);
    return toResponse(result, 201);
  } catch (err) {
    return toErrorResponse(err);
  }
}
```

`toResponse`/`toErrorResponse` (in `src/lib/http.ts`) hold the shared
status-code mapping that used to live in Express's
`error-handler.ts`: `ZodError` → 400, `NotFoundError` → 404,
`ConflictError` → 409, anything else → 500 (logged server-side, no
stack trace leaked).

## Data model

DynamoDB supports nested maps and lists natively, so items are stored
in exactly the current API response shape — no flatten/reconstruct
mapper is needed:

```json
{
  "id": 52,
  "firstname": "...",
  "lastname": "...",
  "shortname": "...",
  "sex": "M",
  "country": { "code": "ESP", "picture": "https://..." },
  "picture": "https://...",
  "data": {
    "rank": 1,
    "points": 100,
    "weight": 85000,
    "height": 188,
    "age": 32,
    "last": [1, 1, 1, 0, 1]
  },
  "countryCode": "ESP",
  "height": 188,
  "recordType": "PLAYER"
}
```

- **Table:** `Players`, partition key `id` (Number), billing mode
  `PAY_PER_REQUEST`. Client-supplied id is required and must not
  already exist — enforced via a conditional `PutItem` with
  `attribute_not_exists(id)`, throwing `ConflictError` on failure
  (replaces today's explicit existence check).
- **`countryCode`** and **`height`** are top-level denormalized copies
  of `country.code` and `data.height` — GSI keys must reference
  top-level scalar attributes, not nested paths. The write path
  (create/update) sets both the nested value and its top-level copy;
  nothing else touches these fields since all writes go through
  `services/`.
- **`recordType`** is a constant `"PLAYER"` on every item, used only as
  the `HeightIndex` partition key (see below).

### GSIs

- **`CountryIndex`** — PK `countryCode`, SK `id`. Serves a "list
  players for a given country" access pattern, and is what
  `best-country` uses: with an `INCLUDE` projection of `countryCode`
  and `data` (GSI projections are whole top-level attributes, not
  nested paths), scan the index (smaller items than a full-table scan,
  since `firstname`/`picture`/etc. aren't copied) to group wins/games
  per country — same math as the original spec.
- **`HeightIndex`** — PK constant `recordType = "PLAYER"` (so every
  item lands in one GSI partition), SK `height` (Number). Querying this
  index returns every player already sorted by height; `median-height`
  reads the sorted list directly and picks the middle index/average,
  no client-side sort needed.
- **`average-bmi`** needs every player's weight+height regardless of
  grouping or order, so it stays a plain base-table `Scan` — no GSI
  changes its cost or code, so none is added for it.

Note: for this dataset's size, querying a GSI partition that holds
"everything" still reads as many items as a full `Scan` would — the
RCU/latency win only shows up at larger scale. The value here is
demonstrating the pattern (denormalized keys, narrower projections,
server-side sorted retrieval), per the explicit ask for GSIs even where
the dataset doesn't strictly need them.

## File layout

```
terraform/
  dynamodb.tf        # Players table + CountryIndex + HeightIndex GSIs
  lambda.tf           # IAM role/policy + 9 function resources
  apigateway.tf        # HTTP API + route -> Lambda integrations
  variables.tf, outputs.tf

src/
  lib/
    dynamodb.ts        # DynamoDBDocumentClient singleton (replaces prisma.ts);
                        #   reads DYNAMODB_ENDPOINT when set (test/local),
                        #   omits it otherwise (real AWS, Lambda execution role)
    http.ts             # toResponse(data, status) / toErrorResponse(err)
  types/player.ts       # unchanged
  schemas/player.schema.ts  # unchanged
  errors.ts              # unchanged
  services/
    players.service.ts   # same method names/signatures, DynamoDB commands
    kpis.service.ts       # same method names, Scan/Query instead of findMany
  handlers/
    players/
      list.ts, get.ts, create.ts, update.ts, remove.ts
    kpis/
      all.ts, bestCountry.ts, averageBmi.ts, medianHeight.ts

seed/
  seed.ts              # reads headtohead.json, writes items via BatchWriteItem
                        #   (replaces prisma/seed.ts; run against Floci locally
                        #   or the real table)

tests/  (same files as today, adapted to the new layer)
headtohead.json
```

Removed: `prisma/`, `src/lib/prisma.ts`, `src/mappers/player.mapper.ts`,
`src/app.ts`, `src/server.ts`, `src/routes/`, `src/controllers/`,
`src/middleware/` (Express's `asyncHandler`/`error-handler` have no
equivalent in a Lambda-per-route model; their logic moves into
`src/lib/http.ts`).

## Packaging & deployment (Terraform)

- `dynamodb.tf`: `aws_dynamodb_table "players"` with `PAY_PER_REQUEST`
  billing and the two GSIs above.
- `lambda.tf`: one `aws_iam_role` (Lambda execution) + one
  `aws_iam_role_policy` granting
  `dynamodb:GetItem/PutItem/UpdateItem/DeleteItem/Query/Scan/BatchWriteItem`
  scoped to the table ARN and its index ARNs, plus basic CloudWatch
  Logs permissions. Nine `aws_lambda_function` resources, each with
  `environment { TABLE_NAME = ... }`.
- **Packaging:** all handlers are compiled once (`tsc`/esbuild) into one
  `dist/` and zipped once; each `aws_lambda_function` points at that
  same zip but a different `handler` value (e.g.
  `handlers/players/list.handler`,
  `handlers/kpis/bestCountry.handler`). One artifact, one
  `source_code_hash`, nine functions.
- `apigateway.tf`: one `aws_apigatewayv2_api` (HTTP API), one
  `aws_apigatewayv2_integration` + `aws_apigatewayv2_route` per
  endpoint, an auto-deploying `$default` stage, and an
  `aws_lambda_permission` per function allowing API Gateway to invoke
  it.
- `package.json`: drop `@prisma/adapter-better-sqlite3`,
  `@prisma/client`, `better-sqlite3`, `prisma`; add
  `@aws-sdk/client-dynamodb`, `@aws-sdk/lib-dynamodb`.
- The user runs `terraform init`/`plan`/`apply` themselves; this work
  only produces the Terraform config and application code.

## Local dev & testing (Floci)

To keep the existing "one schema definition, pushed before tests"
pattern (today's `jest.global-setup.js` runs `prisma db push` against
`schema.prisma`) instead of hand-duplicating the table+GSI definitions
in a second place:

- `jest.global-setup.js` starts a Floci container
  (`floci/floci`), then runs `terraform apply` against it
  (endpoint override + dummy credentials, a separate local state dir,
  e.g. `terraform/.test-state`) using the real `terraform/dynamodb.tf`
  — so the table schema tests run against is exactly the schema that
  gets deployed, never a hand-copied duplicate.
- `jest.setup.js` loads `.env.test`
  (`DYNAMODB_ENDPOINT=http://localhost:<floci-port>`, dummy
  `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`, `AWS_REGION`), same as it
  loads `DATABASE_URL` today.
- Service and handler tests (`players.service.test.ts`,
  `kpis.service.test.ts`, `players.handlers.test.ts`,
  `kpis.handlers.test.ts`) call real `PutItem`/`GetItem`/`Query`/`Scan`
  against Floci, same assertion style as today's SQLite-backed tests —
  invoking handler functions directly with a constructed
  `APIGatewayProxyEventV2` instead of Supertest hitting an Express app.
- `seed/seed.ts` is reused against the Floci-backed table for seeding
  test data, same as `seed.test.ts` does against the Prisma test DB
  today.

## Error handling

Same error taxonomy as the original spec, now mapped in
`toErrorResponse` instead of Express middleware:

- zod validation errors → `400` with `{ error: "ValidationError", details: [...] }`
- `NotFoundError` → `404` with `{ error: "NotFound", message: "..." }`
- `ConflictError` → `409` with `{ error: "Conflict", message: "..." }`
- anything unexpected → `500` with `{ error: "InternalError" }` (logged
  server-side via CloudWatch Logs, no stack trace in the response)

## Out of scope

- Authentication/authorization, pagination/filtering/sorting on
  `GET /players`, and additional KPIs beyond the four listed — same
  exclusions as the original design spec.
- CI/CD for `terraform apply` — deployment is manual, run by the user.
- Multiple environments (dev/staging/prod Terraform workspaces) — a
  single environment for now.
- DynamoDB backups/PITR and autoscaling — `PAY_PER_REQUEST` billing
  sidesteps capacity planning; backups aren't needed for a demo.
- Observability beyond default CloudWatch Logs — no X-Ray tracing,
  custom metrics, or alarms.
- Migrating existing `dev.db` data — the DynamoDB table is repopulated
  from `headtohead.json` via the new seed script, same as today's
  fresh-seed workflow.
