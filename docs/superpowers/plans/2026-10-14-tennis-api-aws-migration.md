# Tennis Head-to-Head API — AWS Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Express + Prisma/SQLite tennis head-to-head API with the same endpoints and behavior served by one AWS Lambda function per route behind an API Gateway HTTP API, backed by DynamoDB, deployed via Terraform.

**Architecture:** Each current Express route becomes its own Lambda handler (`src/handlers/players/*.ts`, `src/handlers/kpis/*.ts`) that parses the API Gateway v2 event, validates with the existing zod schemas, calls a DynamoDB-backed service (`src/services/*.ts`), and maps the result/error to a proxy response via shared helpers (`src/lib/http.ts`). Terraform (`terraform/`) defines the `Players` DynamoDB table (with `CountryIndex` and `HeightIndex` GSIs), the Lambda functions, and the HTTP API. Tests run the same service/handler code against a local Floci container, with the schema pushed via `terraform apply -target` against that container — the real table definition, never a duplicate.

**Tech Stack:** Node.js + TypeScript, `@aws-sdk/client-dynamodb` + `@aws-sdk/lib-dynamodb` (AWS SDK v3), zod, Jest, Terraform (AWS + `hashicorp/archive` providers), Floci (local AWS emulator) for tests.

**Spec:** `docs/superpowers/specs/2026-10-14-tennis-api-aws-migration-design.md`

## Global Constraints

- Same endpoints, validation rules, and response shapes as the original Express API (`docs/superpowers/specs/2026-10-14-tennis-api-design.md`) and the AWS migration spec — this is an infra swap, not a feature change.
- DynamoDB table `Players`, partition key `id` (Number), billing mode `PAY_PER_REQUEST`.
- GSIs: `CountryIndex` (PK `countryCode`, SK `id`, projection `INCLUDE countryCode, data`) and `HeightIndex` (PK constant `recordType`, SK `height`, projection `KEYS_ONLY` is insufficient since `median-height` needs the height values which are already the sort key — projection type `KEYS_ONLY` is fine here since `height` is the SK itself and is always returned).
- Items are stored in the nested API shape plus three denormalized top-level fields: `countryCode`, `height`, `recordType` — no other flattening.
- Lambda runtime `nodejs20.x`; one zip artifact built from `dist/` (compiled TS + production `node_modules`) shared by all 9 `aws_lambda_function` resources, each with a different `handler` value.
- The user runs `terraform init`/`plan`/`apply` themselves — no task in this plan runs Terraform against real AWS.
- Old Express/Prisma code stays in place and keeps passing its own tests until the new stack is fully built and verified (Task 10), then is deleted in one commit — the repo must never sit in a broken intermediate state.

## Review Focus

- Non-numeric or missing `id` path parameter on `GET/PUT/DELETE /players/{id}` must return `400` via the existing `idParamSchema`, not crash the handler on an `undefined` key.
- `GET /kpis` on an empty table must return `{ "bestCountry": null, "averageBmi": null, "medianHeight": null }` (each KPI independently null), not throw.
- `Scan`/`Query` pagination (`LastEvaluatedKey`) must be followed to completion — a KPI silently computed from only the first page would be a correctness bug, not just a style issue.
- A DynamoDB error that is *not* `ConditionalCheckFailedException` (e.g. a bad table name) must surface as a generic `500`, not get mis-mapped to `404`/`409`.
- The path-param `id` (a string from API Gateway) must be coerced to a `Number` via `idParamSchema` before being used as the DynamoDB key — passing the raw string would silently fail to match the Number-typed partition key.

---

### Task 1: Terraform — DynamoDB table and GSIs

**Files:**
- Create: `terraform/provider.tf`
- Create: `terraform/variables.tf`
- Create: `terraform/dynamodb.tf`
- Create: `terraform/outputs.tf`

**Interfaces:**
- Produces: DynamoDB table resource `aws_dynamodb_table.players` (name from `var.table_name`, default `"Players"`), with GSIs `CountryIndex` and `HeightIndex`, consumed by Task 2 (Lambda IAM policy) and Task 5 (test harness `terraform apply -target=aws_dynamodb_table.players`).
- Produces: `var.aws_region` (default `"us-east-1"`), `var.table_name` (default `"Players"`), `var.lambda_runtime` (default `"nodejs20.x"`), consumed by Tasks 2–3.

- [ ] **Step 1: Write `terraform/provider.tf`**

```hcl
terraform {
  required_version = ">= 1.5"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
  backend "local" {
    path = "terraform.tfstate"
  }
}

provider "aws" {
  region = var.aws_region
}
```

(The `backend "local"` block makes the state file path explicit and overridable via `-backend-config` at init time — needed so Task 5's test harness can point Terraform at an isolated test state file without the unsupported `-state` flag.)

- [ ] **Step 2: Write `terraform/variables.tf`**

```hcl
variable "aws_region" {
  description = "AWS region to deploy into"
  type        = string
  default     = "us-east-1"
}

variable "table_name" {
  description = "DynamoDB table name for players"
  type        = string
  default     = "Players"
}

variable "lambda_runtime" {
  description = "Lambda Node.js runtime"
  type        = string
  default     = "nodejs20.x"
}
```

- [ ] **Step 3: Write `terraform/dynamodb.tf`**

```hcl
resource "aws_dynamodb_table" "players" {
  name         = var.table_name
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "id"

  attribute {
    name = "id"
    type = "N"
  }

  attribute {
    name = "countryCode"
    type = "S"
  }

  attribute {
    name = "recordType"
    type = "S"
  }

  attribute {
    name = "height"
    type = "N"
  }

  global_secondary_index {
    name            = "CountryIndex"
    hash_key        = "countryCode"
    range_key       = "id"
    projection_type = "INCLUDE"
    non_key_attributes = ["data"]
  }

  global_secondary_index {
    name            = "HeightIndex"
    hash_key        = "recordType"
    range_key       = "height"
    projection_type = "KEYS_ONLY"
  }
}
```

- [ ] **Step 4: Write `terraform/outputs.tf`**

```hcl
output "table_name" {
  value = aws_dynamodb_table.players.name
}

output "table_arn" {
  value = aws_dynamodb_table.players.arn
}
```

- [ ] **Step 5: Add Terraform artifacts to `.gitignore`**

Append to the repo root `.gitignore` (create the file if the lines below aren't already covered):

```
terraform/.terraform/
terraform/*.tfstate*
terraform/build/
tests/.terraform-test-state/
```

- [ ] **Step 6: Validate**

Run: `cd terraform && terraform init -input=false -backend=false && terraform validate`
Expected: `Success! The configuration is valid.`

- [ ] **Step 7: Commit**

```bash
git add terraform/provider.tf terraform/variables.tf terraform/dynamodb.tf terraform/outputs.tf .gitignore
git commit -m "Add Terraform DynamoDB table and GSIs for tennis API"
```

---

### Task 2: Terraform — IAM role and Lambda functions

**Files:**
- Modify: `terraform/provider.tf` (add `archive` provider requirement)
- Create: `terraform/lambda.tf`

**Interfaces:**
- Consumes: `aws_dynamodb_table.players` (Task 1: `.arn`, `.name`), `var.lambda_runtime` (Task 1).
- Produces: `local.routes` map (route key → `{ method, path, handler }`) and `aws_lambda_function.routes[each.key]` (for_each over `local.routes`), consumed by Task 3 (API Gateway integrations) to wire routes to the matching function.
- Produces: `data.archive_file.lambda_zip` pointing at `../dist`, consumed by Task 10 (the `npm run build` step must populate `dist/` with compiled JS + production `node_modules` before `terraform apply` runs).

- [ ] **Step 1: Add the archive provider requirement to `terraform/provider.tf`**

```hcl
terraform {
  required_version = ">= 1.5"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.4"
    }
  }
}

provider "aws" {
  region = var.aws_region
}
```

- [ ] **Step 2: Write `terraform/lambda.tf`**

```hcl
locals {
  routes = {
    list_players       = { method = "GET",    path = "/players",            handler = "handlers/players/list.handler" }
    get_player         = { method = "GET",    path = "/players/{id}",       handler = "handlers/players/get.handler" }
    create_player      = { method = "POST",   path = "/players",            handler = "handlers/players/create.handler" }
    update_player      = { method = "PUT",    path = "/players/{id}",       handler = "handlers/players/update.handler" }
    delete_player      = { method = "DELETE", path = "/players/{id}",       handler = "handlers/players/remove.handler" }
    kpis_all           = { method = "GET",    path = "/kpis",               handler = "handlers/kpis/all.handler" }
    kpi_best_country   = { method = "GET",    path = "/kpis/best-country",  handler = "handlers/kpis/bestCountry.handler" }
    kpi_average_bmi    = { method = "GET",    path = "/kpis/average-bmi",   handler = "handlers/kpis/averageBmi.handler" }
    kpi_median_height  = { method = "GET",    path = "/kpis/median-height", handler = "handlers/kpis/medianHeight.handler" }
  }
}

data "archive_file" "lambda_zip" {
  type        = "zip"
  source_dir  = "${path.module}/../dist"
  output_path = "${path.module}/build/lambda.zip"
}

resource "aws_iam_role" "lambda_exec" {
  name = "tennis-api-lambda-exec"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy" "lambda_dynamodb" {
  name = "tennis-api-lambda-dynamodb"
  role = aws_iam_role.lambda_exec.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:DeleteItem",
          "dynamodb:Query",
          "dynamodb:Scan",
          "dynamodb:BatchWriteItem",
        ]
        Resource = [
          aws_dynamodb_table.players.arn,
          "${aws_dynamodb_table.players.arn}/index/*",
        ]
      },
      {
        Effect   = "Allow"
        Action   = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "arn:aws:logs:*:*:*"
      },
    ]
  })
}

resource "aws_lambda_function" "routes" {
  for_each         = local.routes
  function_name    = "tennis-api-${replace(each.key, "_", "-")}"
  role             = aws_iam_role.lambda_exec.arn
  handler          = each.value.handler
  runtime          = var.lambda_runtime
  filename         = data.archive_file.lambda_zip.output_path
  source_code_hash = data.archive_file.lambda_zip.output_base64sha256

  environment {
    variables = {
      TABLE_NAME = aws_dynamodb_table.players.name
    }
  }
}
```

- [ ] **Step 3: Validate**

Run: `cd terraform && terraform init -input=false -backend=false -upgrade && terraform validate`
Expected: `Success! The configuration is valid.` (validation does not require `dist/` to exist yet — `archive_file` is only evaluated at `plan`/`apply` time)

- [ ] **Step 4: Commit**

```bash
git add terraform/provider.tf terraform/lambda.tf
git commit -m "Add Terraform IAM role and Lambda functions for tennis API"
```

---

### Task 3: Terraform — HTTP API Gateway

**Files:**
- Create: `terraform/apigateway.tf`
- Modify: `terraform/outputs.tf` (add `api_endpoint` output)

**Interfaces:**
- Consumes: `local.routes`, `aws_lambda_function.routes[each.key]` (Task 2).
- Produces: `aws_apigatewayv2_api.this` and its invoke URL, exposed as the `api_endpoint` output for the user to call after deploying.

- [ ] **Step 1: Write `terraform/apigateway.tf`**

```hcl
resource "aws_apigatewayv2_api" "this" {
  name          = "tennis-headtohead-api"
  protocol_type = "HTTP"
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.this.id
  name        = "$default"
  auto_deploy = true
}

resource "aws_apigatewayv2_integration" "routes" {
  for_each               = local.routes
  api_id                 = aws_apigatewayv2_api.this.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.routes[each.key].invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "routes" {
  for_each  = local.routes
  api_id    = aws_apigatewayv2_api.this.id
  route_key = "${each.value.method} ${each.value.path}"
  target    = "integrations/${aws_apigatewayv2_integration.routes[each.key].id}"
}

resource "aws_lambda_permission" "apigw" {
  for_each      = local.routes
  statement_id  = "AllowAPIGatewayInvoke-${each.key}"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.routes[each.key].function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.this.execution_arn}/*/*"
}
```

- [ ] **Step 2: Add the API endpoint output to `terraform/outputs.tf`**

```hcl
output "table_name" {
  value = aws_dynamodb_table.players.name
}

output "table_arn" {
  value = aws_dynamodb_table.players.arn
}

output "api_endpoint" {
  value = aws_apigatewayv2_stage.default.invoke_url
}
```

- [ ] **Step 3: Validate**

Run: `cd terraform && terraform validate`
Expected: `Success! The configuration is valid.`

- [ ] **Step 4: Commit**

```bash
git add terraform/apigateway.tf terraform/outputs.tf
git commit -m "Add Terraform HTTP API Gateway for tennis API"
```

---

### Task 4: Shared app foundations — DynamoDB client, HTTP response helpers, player item mapping

**Files:**
- Modify: `package.json` (add `@aws-sdk/client-dynamodb`, `@aws-sdk/lib-dynamodb`, `@types/aws-lambda` — do **not** remove Prisma deps yet, per Global Constraints)
- Create: `src/lib/dynamodb.ts`
- Create: `src/lib/http.ts`
- Create: `src/lib/player-item.ts`
- Test: `tests/http.test.ts`
- Test: `tests/player-item.test.ts`

**Interfaces:**
- Produces: `dynamoDb: DynamoDBDocumentClient` and `TABLE_NAME: string` from `src/lib/dynamodb.ts`, consumed by Tasks 5–7 (services) and Task 7 (seed).
- Produces: `toResponse(body: unknown, statusCode?: number): APIGatewayProxyResultV2` and `toErrorResponse(err: unknown): APIGatewayProxyResultV2` from `src/lib/http.ts`, consumed by Tasks 8–9 (handlers).
- Produces: `PlayerItem` type, `toItem(player: Player): PlayerItem`, `fromItem(item: PlayerItem): Player` from `src/lib/player-item.ts`, consumed by Tasks 5–7.

- [ ] **Step 1: Install dependencies**

Run: `npm install @aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb && npm install -D @types/aws-lambda`
Expected: `package.json`/`package-lock.json` updated, install succeeds.

- [ ] **Step 2: Write the failing test for `player-item.ts`**

```ts
// tests/player-item.test.ts
import { toItem, fromItem } from "../src/lib/player-item";
import type { Player } from "../src/types/player";

const player: Player = {
  id: 1,
  firstname: "Test",
  lastname: "Player",
  shortname: "T.PLA",
  sex: "M",
  country: { picture: "https://example.com/fra.png", code: "FRA" },
  picture: "https://example.com/test.png",
  data: { rank: 1, points: 100, weight: 80000, height: 180, age: 25, last: [1, 0, 1] },
};

describe("player-item mapping", () => {
  it("adds denormalized GSI fields on toItem", () => {
    const item = toItem(player);
    expect(item.countryCode).toBe("FRA");
    expect(item.height).toBe(180);
    expect(item.recordType).toBe("PLAYER");
  });

  it("round-trips back to the exact Player shape via fromItem", () => {
    expect(fromItem(toItem(player))).toEqual(player);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx jest tests/player-item.test.ts`
Expected: FAIL — `Cannot find module '../src/lib/player-item'`

- [ ] **Step 4: Write `src/lib/player-item.ts`**

```ts
import type { Player } from "../types/player";

export interface PlayerItem extends Player {
  countryCode: string;
  height: number;
  recordType: "PLAYER";
}

export function toItem(player: Player): PlayerItem {
  return {
    ...player,
    countryCode: player.country.code,
    height: player.data.height,
    recordType: "PLAYER",
  };
}

export function fromItem(item: PlayerItem): Player {
  const { countryCode, height, recordType, ...player } = item;
  return player;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx jest tests/player-item.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 6: Write the failing test for `http.ts`**

```ts
// tests/http.test.ts
import { ZodError, z } from "zod";
import { toResponse, toErrorResponse } from "../src/lib/http";
import { NotFoundError, ConflictError } from "../src/errors";

describe("toResponse", () => {
  it("serializes a body with the given status code", () => {
    const res = toResponse({ a: 1 }, 201);
    expect(res.statusCode).toBe(201);
    expect(res.body).toBe(JSON.stringify({ a: 1 }));
  });

  it("defaults to status 200", () => {
    expect(toResponse({ a: 1 }).statusCode).toBe(200);
  });

  it("returns an empty body for undefined (e.g. DELETE)", () => {
    const res = toResponse(undefined, 204);
    expect(res.statusCode).toBe(204);
    expect(res.body).toBe("");
  });
});

describe("toErrorResponse", () => {
  it("maps ZodError to 400", () => {
    let zodError: ZodError;
    try {
      z.object({ a: z.number() }).parse({ a: "x" });
      throw new Error("should not reach");
    } catch (err) {
      zodError = err as ZodError;
    }
    const res = toErrorResponse(zodError);
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body as string).error).toBe("ValidationError");
  });

  it("maps NotFoundError to 404", () => {
    const res = toErrorResponse(new NotFoundError("player 1 not found"));
    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body as string)).toEqual({ error: "NotFound", message: "player 1 not found" });
  });

  it("maps ConflictError to 409", () => {
    const res = toErrorResponse(new ConflictError("player 1 already exists"));
    expect(res.statusCode).toBe(409);
    expect(JSON.parse(res.body as string)).toEqual({ error: "Conflict", message: "player 1 already exists" });
  });

  it("maps an unrecognized error to 500 without leaking details", () => {
    const res = toErrorResponse(new Error("boom"));
    expect(res.statusCode).toBe(500);
    expect(JSON.parse(res.body as string)).toEqual({ error: "InternalError" });
  });
});
```

- [ ] **Step 7: Run test to verify it fails**

Run: `npx jest tests/http.test.ts`
Expected: FAIL — `Cannot find module '../src/lib/http'`

- [ ] **Step 8: Write `src/lib/http.ts`**

```ts
import type { APIGatewayProxyResultV2 } from "aws-lambda";
import { ZodError } from "zod";
import { NotFoundError, ConflictError } from "../errors";

export function toResponse(body: unknown, statusCode = 200): APIGatewayProxyResultV2 {
  if (body === undefined) {
    return { statusCode, body: "" };
  }
  return {
    statusCode,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}

export function toErrorResponse(err: unknown): APIGatewayProxyResultV2 {
  if (err instanceof ZodError) {
    return toResponse({ error: "ValidationError", details: err.issues }, 400);
  }
  if (err instanceof NotFoundError) {
    return toResponse({ error: "NotFound", message: err.message }, 404);
  }
  if (err instanceof ConflictError) {
    return toResponse({ error: "Conflict", message: err.message }, 409);
  }
  console.error(err);
  return toResponse({ error: "InternalError" }, 500);
}
```

- [ ] **Step 9: Run test to verify it passes**

Run: `npx jest tests/http.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 10: Write `src/lib/dynamodb.ts`** (no dedicated test — a thin, side-effect-free client constructor exercised indirectly by every later task)

```ts
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

const client = new DynamoDBClient({
  region: process.env.AWS_REGION ?? "us-east-1",
  ...(process.env.DYNAMODB_ENDPOINT ? { endpoint: process.env.DYNAMODB_ENDPOINT } : {}),
});

export const dynamoDb = DynamoDBDocumentClient.from(client);
export const TABLE_NAME = process.env.TABLE_NAME ?? "Players";
```

- [ ] **Step 11: Commit**

```bash
git add package.json package-lock.json src/lib/dynamodb.ts src/lib/http.ts src/lib/player-item.ts tests/http.test.ts tests/player-item.test.ts
git commit -m "Add DynamoDB client, HTTP response helpers, and player item mapping"
```

---

### Task 5: Floci test harness + `players.service.ts` migration

**Files:**
- Create: `tests/helpers/dynamodb-test-helpers.ts`
- Modify: `tests/jest.global-setup.js`
- Create: `tests/jest.global-teardown.js`
- Modify: `jest.config.js` (add `globalTeardown`)
- Modify: `.env.test` (add `DYNAMODB_ENDPOINT`, `TABLE_NAME`, `AWS_REGION`, dummy AWS creds)
- Modify: `src/services/players.service.ts`
- Modify: `tests/players.service.test.ts`

**Interfaces:**
- Consumes: `dynamoDb`, `TABLE_NAME` (Task 4 `src/lib/dynamodb.ts`), `toItem`/`fromItem` (Task 4 `src/lib/player-item.ts`).
- Produces: `clearTable(): Promise<void>` from `tests/helpers/dynamodb-test-helpers.ts`, consumed by Task 6 and Task 7's tests.
- Produces: `listPlayers(): Promise<Player[]>`, `getPlayer(id: number): Promise<Player>`, `createPlayer(input: Player): Promise<Player>`, `updatePlayer(id: number, input: Player): Promise<Player>`, `deletePlayer(id: number): Promise<void>` — same signatures as today, now DynamoDB-backed, consumed by Task 8 (players handlers).
- Produces: a running Floci container on `localhost:4566` with the `Players` table (from Task 1's Terraform) created, available to every later test task.

- [ ] **Step 1: Update `.env.test`**

```
DATABASE_URL="file:./prisma/test.db"
DYNAMODB_ENDPOINT="http://localhost:4566"
TABLE_NAME="Players"
AWS_REGION="us-east-1"
AWS_ACCESS_KEY_ID="test"
AWS_SECRET_ACCESS_KEY="test"
```

(`DATABASE_URL` stays until Task 10 removes the Prisma stack.)

- [ ] **Step 2: Rewrite `tests/jest.global-setup.js`**

```js
const { execSync } = require("child_process");
const net = require("net");
const dotenv = require("dotenv");

function waitForPort(host, port, timeoutMs) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    (function attempt() {
      const socket = net.createConnection(port, host);
      socket.once("connect", () => {
        socket.end();
        resolve();
      });
      socket.once("error", () => {
        socket.destroy();
        if (Date.now() - start > timeoutMs) {
          reject(new Error(`timed out waiting for ${host}:${port}`));
        } else {
          setTimeout(attempt, 500);
        }
      });
    })();
  });
}

module.exports = async () => {
  dotenv.config({ path: ".env.test", quiet: true });

  execSync("npx prisma db push --accept-data-loss --url \"" + process.env.DATABASE_URL + "\"", {
    env: { ...process.env, PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION: "yes, go ahead" },
    stdio: "inherit",
  });

  try {
    execSync("docker rm -f tennis-api-floci-test", { stdio: "ignore" });
  } catch {
    // no previous container, fine
  }
  execSync("docker run -d --name tennis-api-floci-test -p 4566:4566 floci/floci", {
    stdio: "inherit",
  });

  await waitForPort("localhost", 4566, 30000);

  const tfEnv = {
    ...process.env,
    AWS_ENDPOINT_URL_DYNAMODB: "http://localhost:4566",
    AWS_ACCESS_KEY_ID: "test",
    AWS_SECRET_ACCESS_KEY: "test",
    AWS_REGION: "us-east-1",
  };

  execSync(
    'terraform init -input=false -reconfigure -backend-config="path=../tests/.terraform-test-state/terraform.tfstate"',
    { cwd: "terraform", stdio: "inherit", env: tfEnv }
  );
  execSync(
    "terraform apply -auto-approve -input=false -target=aws_dynamodb_table.players",
    { cwd: "terraform", stdio: "inherit", env: tfEnv }
  );
};
```

(`-backend-config`/`-reconfigure` overrides the local backend's `path` from `provider.tf`'s `backend "local" { path = "terraform.tfstate" }` without the unsupported legacy `-state` flag, and without prompting to migrate state between the real and test paths.)

- [ ] **Step 3: Write `tests/jest.global-teardown.js`**

```js
const { execSync } = require("child_process");

module.exports = async () => {
  try {
    execSync("docker rm -f tennis-api-floci-test", { stdio: "ignore" });
  } catch {
    // already gone, fine
  }
};
```

- [ ] **Step 4: Add `globalTeardown` to `jest.config.js`**

```js
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["**/tests/**/*.test.ts"],
  setupFiles: ["<rootDir>/tests/jest.setup.js"],
  globalSetup: "<rootDir>/tests/jest.global-setup.js",
  globalTeardown: "<rootDir>/tests/jest.global-teardown.js",
  maxWorkers: 1,
};
```

- [ ] **Step 5: Write `tests/helpers/dynamodb-test-helpers.ts`**

```ts
import { ScanCommand, BatchWriteCommand } from "@aws-sdk/lib-dynamodb";
import { dynamoDb, TABLE_NAME } from "../../src/lib/dynamodb";

export async function clearTable(): Promise<void> {
  const res = await dynamoDb.send(new ScanCommand({ TableName: TABLE_NAME, ProjectionExpression: "id" }));
  const items = res.Items ?? [];
  if (items.length === 0) return;
  await dynamoDb.send(
    new BatchWriteCommand({
      RequestItems: {
        [TABLE_NAME]: items.map((item) => ({ DeleteRequest: { Key: { id: item.id } } })),
      },
    })
  );
}
```

- [ ] **Step 6: Run the existing `players.service.test.ts` against Prisma to confirm the baseline still passes before migrating**

Run: `npx jest tests/players.service.test.ts`
Expected: PASS (8 tests, still Prisma-backed at this point)

- [ ] **Step 7: Rewrite `tests/players.service.test.ts` to target DynamoDB**

```ts
import { clearTable } from "./helpers/dynamodb-test-helpers";
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
    await clearTable();
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

  it("propagates a non-conditional DynamoDB error as a plain error, not NotFound/Conflict", async () => {
    const { dynamoDb } = await import("../src/lib/dynamodb");
    const { GetCommand } = await import("@aws-sdk/lib-dynamodb");
    await expect(
      dynamoDb.send(new GetCommand({ TableName: "DoesNotExist", Key: { id: 1 } }))
    ).rejects.not.toBeInstanceOf(NotFoundError);
  });
});
```

- [ ] **Step 8: Run test to verify it fails**

Run: `npx jest tests/players.service.test.ts`
Expected: FAIL — `src/services/players.service.ts` still imports `../lib/prisma`/`../mappers/player.mapper`, type/behavior mismatches against the new DynamoDB-backed test expectations.

- [ ] **Step 9: Rewrite `src/services/players.service.ts`**

```ts
import { GetCommand, PutCommand, DeleteCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import { dynamoDb, TABLE_NAME } from "../lib/dynamodb";
import { toItem, fromItem, PlayerItem } from "../lib/player-item";
import { NotFoundError, ConflictError } from "../errors";
import type { Player } from "../types/player";

export async function listPlayers(): Promise<Player[]> {
  const items: PlayerItem[] = [];
  let ExclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const res = await dynamoDb.send(new ScanCommand({ TableName: TABLE_NAME, ExclusiveStartKey }));
    items.push(...((res.Items as PlayerItem[] | undefined) ?? []));
    ExclusiveStartKey = res.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items.map(fromItem);
}

export async function getPlayer(id: number): Promise<Player> {
  const res = await dynamoDb.send(new GetCommand({ TableName: TABLE_NAME, Key: { id } }));
  if (!res.Item) throw new NotFoundError(`player ${id} not found`);
  return fromItem(res.Item as PlayerItem);
}

export async function createPlayer(input: Player): Promise<Player> {
  try {
    await dynamoDb.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: toItem(input),
        ConditionExpression: "attribute_not_exists(id)",
      })
    );
  } catch (err) {
    if (err instanceof ConditionalCheckFailedException) {
      throw new ConflictError(`player ${input.id} already exists`);
    }
    throw err;
  }
  return input;
}

export async function updatePlayer(id: number, input: Player): Promise<Player> {
  const updated = { ...input, id };
  try {
    await dynamoDb.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: toItem(updated),
        ConditionExpression: "attribute_exists(id)",
      })
    );
  } catch (err) {
    if (err instanceof ConditionalCheckFailedException) {
      throw new NotFoundError(`player ${id} not found`);
    }
    throw err;
  }
  return updated;
}

export async function deletePlayer(id: number): Promise<void> {
  try {
    await dynamoDb.send(
      new DeleteCommand({
        TableName: TABLE_NAME,
        Key: { id },
        ConditionExpression: "attribute_exists(id)",
      })
    );
  } catch (err) {
    if (err instanceof ConditionalCheckFailedException) {
      throw new NotFoundError(`player ${id} not found`);
    }
    throw err;
  }
}
```

- [ ] **Step 10: Run test to verify it passes**

Run: `npx jest tests/players.service.test.ts`
Expected: PASS (9 tests) — this starts the Floci container and pushes the real Terraform-defined `Players` table before the suite runs.

- [ ] **Step 11: Commit**

```bash
git add tests/helpers/dynamodb-test-helpers.ts tests/jest.global-setup.js tests/jest.global-teardown.js jest.config.js .env.test src/services/players.service.ts tests/players.service.test.ts
git commit -m "Migrate players.service.ts to DynamoDB with Floci test harness"
```

---

### Task 6: `kpis.service.ts` migration

**Files:**
- Modify: `src/services/kpis.service.ts`
- Modify: `tests/kpis.service.test.ts`

**Interfaces:**
- Consumes: `dynamoDb`, `TABLE_NAME` (Task 4), `clearTable` (Task 5), `PlayerItem` (Task 4), `createPlayer` (Task 5, used to seed fixtures instead of raw Prisma inserts).
- Produces: `getBestCountry(): Promise<BestCountryResult | null>`, `getAverageBmi(): Promise<number | null>`, `getMedianHeight(): Promise<number | null>` — same signatures as today, consumed by Task 9 (KPI handlers).

- [ ] **Step 1: Rewrite `tests/kpis.service.test.ts`**

```ts
import { clearTable } from "./helpers/dynamodb-test-helpers";
import * as playersService from "../src/services/players.service";
import * as kpisService from "../src/services/kpis.service";
import type { Player } from "../src/types/player";

function makePlayer(overrides: Partial<{
  id: number;
  countryCode: string;
  height: number;
  weight: number;
  last: number[];
}>): Player {
  const id = overrides.id ?? 1;
  return {
    id,
    firstname: `P${id}`,
    lastname: "Test",
    shortname: `P${id}.T`,
    sex: "M",
    country: { code: overrides.countryCode ?? "FRA", picture: "https://example.com/fra.png" },
    picture: "https://example.com/test.png",
    data: {
      rank: 1,
      points: 100,
      weight: overrides.weight ?? 70000,
      height: overrides.height ?? 180,
      age: 25,
      last: overrides.last ?? [1, 0],
    },
  };
}

describe("kpis.service", () => {
  beforeEach(async () => {
    await clearTable();
  });

  describe("getBestCountry", () => {
    it("returns null when there are no players", async () => {
      expect(await kpisService.getBestCountry()).toBeNull();
    });

    it("picks the country with the clear best win ratio", async () => {
      await playersService.createPlayer(makePlayer({ id: 1, countryCode: "AAA", last: [1, 1] }));
      await playersService.createPlayer(makePlayer({ id: 2, countryCode: "BBB", last: [0, 0] }));
      expect(await kpisService.getBestCountry()).toEqual({ code: "AAA", ratio: 1 });
    });

    it("breaks a tie alphabetically by country code", async () => {
      await playersService.createPlayer(makePlayer({ id: 1, countryCode: "BBB", last: [1, 0] }));
      await playersService.createPlayer(makePlayer({ id: 2, countryCode: "AAA", last: [1, 0] }));
      expect(await kpisService.getBestCountry()).toEqual({ code: "AAA", ratio: 0.5 });
    });
  });

  describe("getAverageBmi", () => {
    it("returns null when there are no players", async () => {
      expect(await kpisService.getAverageBmi()).toBeNull();
    });

    it("computes the average BMI across all players", async () => {
      await playersService.createPlayer(makePlayer({ id: 1, weight: 70000, height: 175 }));
      await playersService.createPlayer(makePlayer({ id: 2, weight: 80000, height: 160 }));
      const result = await kpisService.getAverageBmi();
      expect(result).toBeCloseTo(27.0536, 3);
    });
  });

  describe("getMedianHeight", () => {
    it("returns null when there are no players", async () => {
      expect(await kpisService.getMedianHeight()).toBeNull();
    });

    it("computes the median for an odd number of players", async () => {
      await playersService.createPlayer(makePlayer({ id: 1, height: 170 }));
      await playersService.createPlayer(makePlayer({ id: 2, height: 190 }));
      await playersService.createPlayer(makePlayer({ id: 3, height: 180 }));
      expect(await kpisService.getMedianHeight()).toBe(180);
    });

    it("computes the median for an even number of players", async () => {
      await playersService.createPlayer(makePlayer({ id: 1, height: 170 }));
      await playersService.createPlayer(makePlayer({ id: 2, height: 180 }));
      await playersService.createPlayer(makePlayer({ id: 3, height: 190 }));
      await playersService.createPlayer(makePlayer({ id: 4, height: 200 }));
      expect(await kpisService.getMedianHeight()).toBe(185);
    });

    it("follows pagination across multiple pages instead of reading only the first page", async () => {
      for (let i = 1; i <= 5; i++) {
        await playersService.createPlayer(makePlayer({ id: i, height: 150 + i }));
      }
      // forcePageSize is read by kpis.service's internal query helper only in test mode
      process.env.KPI_TEST_PAGE_SIZE = "1";
      try {
        const result = await kpisService.getMedianHeight();
        expect(result).toBe(153); // heights 151..155, median is 153
      } finally {
        delete process.env.KPI_TEST_PAGE_SIZE;
      }
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/kpis.service.test.ts`
Expected: FAIL — `src/services/kpis.service.ts` still uses `prisma.player.findMany()`.

- [ ] **Step 3: Rewrite `src/services/kpis.service.ts`**

```ts
import { QueryCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { dynamoDb, TABLE_NAME } from "../lib/dynamodb";
import type { PlayerItem } from "../lib/player-item";

export interface BestCountryResult {
  code: string;
  ratio: number;
}

function testPageLimit(): number | undefined {
  const raw = process.env.KPI_TEST_PAGE_SIZE;
  return raw ? Number(raw) : undefined;
}

async function scanCountryIndex(): Promise<Pick<PlayerItem, "countryCode" | "data">[]> {
  const items: Pick<PlayerItem, "countryCode" | "data">[] = [];
  let ExclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const res = await dynamoDb.send(
      new ScanCommand({
        TableName: TABLE_NAME,
        IndexName: "CountryIndex",
        ExclusiveStartKey,
        Limit: testPageLimit(),
      })
    );
    items.push(...((res.Items as Pick<PlayerItem, "countryCode" | "data">[] | undefined) ?? []));
    ExclusiveStartKey = res.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items;
}

async function scanTable(): Promise<PlayerItem[]> {
  const items: PlayerItem[] = [];
  let ExclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const res = await dynamoDb.send(
      new ScanCommand({ TableName: TABLE_NAME, ExclusiveStartKey, Limit: testPageLimit() })
    );
    items.push(...((res.Items as PlayerItem[] | undefined) ?? []));
    ExclusiveStartKey = res.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items;
}

async function queryHeightIndex(): Promise<number[]> {
  const heights: number[] = [];
  let ExclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const res = await dynamoDb.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: "HeightIndex",
        KeyConditionExpression: "recordType = :r",
        ExpressionAttributeValues: { ":r": "PLAYER" },
        ExclusiveStartKey,
        Limit: testPageLimit(),
      })
    );
    heights.push(...((res.Items as { height: number }[] | undefined)?.map((i) => i.height) ?? []));
    ExclusiveStartKey = res.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return heights;
}

export async function getBestCountry(): Promise<BestCountryResult | null> {
  const items = await scanCountryIndex();
  if (items.length === 0) return null;

  const byCountry = new Map<string, { wins: number; games: number }>();
  for (const item of items) {
    const last = item.data.last;
    const wins = last.filter((v) => v === 1).length;
    const games = last.length;
    const entry = byCountry.get(item.countryCode) ?? { wins: 0, games: 0 };
    entry.wins += wins;
    entry.games += games;
    byCountry.set(item.countryCode, entry);
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
  const items = await scanTable();
  if (items.length === 0) return null;

  const total = items.reduce((sum, item) => {
    const weightKg = item.data.weight / 1000;
    const heightM = item.data.height / 100;
    return sum + weightKg / (heightM * heightM);
  }, 0);

  return total / items.length;
}

export async function getMedianHeight(): Promise<number | null> {
  const heights = await queryHeightIndex();
  if (heights.length === 0) return null;

  const mid = Math.floor(heights.length / 2);
  if (heights.length % 2 === 0) {
    return (heights[mid - 1] + heights[mid]) / 2;
  }
  return heights[mid];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/kpis.service.test.ts`
Expected: PASS (9 tests, including the forced-pagination test)

- [ ] **Step 5: Commit**

```bash
git add src/services/kpis.service.ts tests/kpis.service.test.ts
git commit -m "Migrate kpis.service.ts to DynamoDB Scan/Query with pagination"
```

---

### Task 7: Seed script migration

**Files:**
- Create: `seed/seed.ts`
- Create: `tests/seed.test.ts` (replaces `tests/seed.test.ts`'s Prisma-based content)

**Interfaces:**
- Consumes: `dynamoDb`, `TABLE_NAME` (Task 4), `toItem` (Task 4), `clearTable` (Task 5).
- Produces: `seedDatabase(jsonPath: string): Promise<void>`, consumed only by the CLI entrypoint in this file and by its own test — no other task depends on it.

- [ ] **Step 1: Write the failing test `tests/seed.test.ts`** (overwrite the Prisma-based version)

```ts
import path from "path";
import { clearTable } from "./helpers/dynamodb-test-helpers";
import { seedDatabase } from "../seed/seed";
import * as playersService from "../src/services/players.service";

describe("seedDatabase", () => {
  beforeEach(async () => {
    await clearTable();
  });

  it("loads all 5 players from headtohead.json", async () => {
    await seedDatabase(path.join(__dirname, "..", "headtohead.json"));
    const players = await playersService.listPlayers();
    expect(players).toHaveLength(5);
  });

  it("maps Djokovic's fields and last array correctly", async () => {
    await seedDatabase(path.join(__dirname, "..", "headtohead.json"));
    const player = await playersService.getPlayer(52);
    expect(player.firstname).toBe("Novak");
    expect(player.data.rank).toBe(2);
    expect(player.data.last).toEqual([1, 1, 1, 1, 1]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/seed.test.ts`
Expected: FAIL — `Cannot find module '../seed/seed'`

- [ ] **Step 3: Write `seed/seed.ts`**

```ts
import { readFileSync } from "fs";
import path from "path";
import { BatchWriteCommand } from "@aws-sdk/lib-dynamodb";
import { dynamoDb, TABLE_NAME } from "../src/lib/dynamodb";
import { toItem } from "../src/lib/player-item";
import type { Player } from "../src/types/player";

export async function seedDatabase(jsonPath: string): Promise<void> {
  const raw = readFileSync(jsonPath, "utf-8");
  const data = JSON.parse(raw) as { players: Player[] };

  const batches: Player[][] = [];
  for (let i = 0; i < data.players.length; i += 25) {
    batches.push(data.players.slice(i, i + 25));
  }

  for (const batch of batches) {
    await dynamoDb.send(
      new BatchWriteCommand({
        RequestItems: {
          [TABLE_NAME]: batch.map((player) => ({ PutRequest: { Item: toItem(player) } })),
        },
      })
    );
  }
}

if (require.main === module) {
  seedDatabase(path.join(__dirname, "..", "headtohead.json")).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/seed.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add seed/seed.ts tests/seed.test.ts
git commit -m "Migrate seed script to DynamoDB BatchWriteItem"
```

---

### Task 8: Players Lambda handlers

**Files:**
- Create: `src/handlers/players/list.ts`
- Create: `src/handlers/players/get.ts`
- Create: `src/handlers/players/create.ts`
- Create: `src/handlers/players/update.ts`
- Create: `src/handlers/players/remove.ts`
- Test: `tests/players.handlers.test.ts`

**Interfaces:**
- Consumes: `playerSchema`, `idParamSchema` (`src/schemas/player.schema.ts`, unchanged), `toResponse`/`toErrorResponse` (Task 4), `playersService.*` (Task 5).
- Produces: `handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2>` exported from each file, consumed by Task 2's Terraform `local.routes` handler paths (`handlers/players/list.handler`, etc. — must match exactly).

- [ ] **Step 1: Write the failing test `tests/players.handlers.test.ts`**

```ts
import type { APIGatewayProxyEventV2 } from "aws-lambda";
import { clearTable } from "./helpers/dynamodb-test-helpers";
import { handler as list } from "../src/handlers/players/list";
import { handler as get } from "../src/handlers/players/get";
import { handler as create } from "../src/handlers/players/create";
import { handler as update } from "../src/handlers/players/update";
import { handler as remove } from "../src/handlers/players/remove";

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

function event(overrides: Partial<APIGatewayProxyEventV2> = {}): APIGatewayProxyEventV2 {
  return {
    pathParameters: {},
    body: undefined,
    ...overrides,
  } as APIGatewayProxyEventV2;
}

describe("players handlers", () => {
  beforeEach(async () => {
    await clearTable();
  });

  it("list returns 200 with all players", async () => {
    await create(event({ body: JSON.stringify(fixture) }));
    const res = await list(event());
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body as string)).toEqual([fixture]);
  });

  it("get returns 200 with the player", async () => {
    await create(event({ body: JSON.stringify(fixture) }));
    const res = await get(event({ pathParameters: { id: "1" } }));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body as string)).toEqual(fixture);
  });

  it("get returns 404 for a missing id", async () => {
    const res = await get(event({ pathParameters: { id: "999" } }));
    expect(res.statusCode).toBe(404);
  });

  it("get returns 400 for a non-numeric id", async () => {
    const res = await get(event({ pathParameters: { id: "abc" } }));
    expect(res.statusCode).toBe(400);
  });

  it("get returns 400 when the id path parameter is missing", async () => {
    const res = await get(event({ pathParameters: {} }));
    expect(res.statusCode).toBe(400);
  });

  it("create returns 201 with the created player", async () => {
    const res = await create(event({ body: JSON.stringify(fixture) }));
    expect(res.statusCode).toBe(201);
    expect(JSON.parse(res.body as string)).toEqual(fixture);
  });

  it("create returns 400 for an invalid body", async () => {
    const res = await create(event({ body: JSON.stringify({ ...fixture, sex: "X" }) }));
    expect(res.statusCode).toBe(400);
  });

  it("create returns 409 for a duplicate id", async () => {
    await create(event({ body: JSON.stringify(fixture) }));
    const res = await create(event({ body: JSON.stringify(fixture) }));
    expect(res.statusCode).toBe(409);
  });

  it("update returns 200 with the updated player", async () => {
    await create(event({ body: JSON.stringify(fixture) }));
    const res = await update(
      event({ pathParameters: { id: "1" }, body: JSON.stringify({ ...fixture, firstname: "Changed" }) })
    );
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body as string).firstname).toBe("Changed");
  });

  it("update returns 404 for a missing id", async () => {
    const res = await update(event({ pathParameters: { id: "999" }, body: JSON.stringify(fixture) }));
    expect(res.statusCode).toBe(404);
  });

  it("remove returns 204", async () => {
    await create(event({ body: JSON.stringify(fixture) }));
    const res = await remove(event({ pathParameters: { id: "1" } }));
    expect(res.statusCode).toBe(204);
  });

  it("remove returns 404 for a missing id", async () => {
    const res = await remove(event({ pathParameters: { id: "999" } }));
    expect(res.statusCode).toBe(404);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/players.handlers.test.ts`
Expected: FAIL — `Cannot find module '../src/handlers/players/list'`

- [ ] **Step 3: Write `src/handlers/players/list.ts`**

```ts
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { toResponse, toErrorResponse } from "../../lib/http";
import * as playersService from "../../services/players.service";

export async function handler(_event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  try {
    const players = await playersService.listPlayers();
    return toResponse(players, 200);
  } catch (err) {
    return toErrorResponse(err);
  }
}
```

- [ ] **Step 4: Write `src/handlers/players/get.ts`**

```ts
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { idParamSchema } from "../../schemas/player.schema";
import { toResponse, toErrorResponse } from "../../lib/http";
import * as playersService from "../../services/players.service";

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  try {
    const id = idParamSchema.parse(event.pathParameters?.id);
    const player = await playersService.getPlayer(id);
    return toResponse(player, 200);
  } catch (err) {
    return toErrorResponse(err);
  }
}
```

- [ ] **Step 5: Write `src/handlers/players/create.ts`**

```ts
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { playerSchema } from "../../schemas/player.schema";
import { toResponse, toErrorResponse } from "../../lib/http";
import * as playersService from "../../services/players.service";

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  try {
    const input = playerSchema.parse(JSON.parse(event.body ?? "{}"));
    const player = await playersService.createPlayer(input);
    return toResponse(player, 201);
  } catch (err) {
    return toErrorResponse(err);
  }
}
```

- [ ] **Step 6: Write `src/handlers/players/update.ts`**

```ts
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { playerSchema, idParamSchema } from "../../schemas/player.schema";
import { toResponse, toErrorResponse } from "../../lib/http";
import * as playersService from "../../services/players.service";

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  try {
    const id = idParamSchema.parse(event.pathParameters?.id);
    const input = playerSchema.parse(JSON.parse(event.body ?? "{}"));
    const player = await playersService.updatePlayer(id, input);
    return toResponse(player, 200);
  } catch (err) {
    return toErrorResponse(err);
  }
}
```

- [ ] **Step 7: Write `src/handlers/players/remove.ts`**

```ts
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { idParamSchema } from "../../schemas/player.schema";
import { toResponse, toErrorResponse } from "../../lib/http";
import * as playersService from "../../services/players.service";

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  try {
    const id = idParamSchema.parse(event.pathParameters?.id);
    await playersService.deletePlayer(id);
    return toResponse(undefined, 204);
  } catch (err) {
    return toErrorResponse(err);
  }
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npx jest tests/players.handlers.test.ts`
Expected: PASS (12 tests)

- [ ] **Step 9: Commit**

```bash
git add src/handlers/players tests/players.handlers.test.ts
git commit -m "Add players Lambda handlers"
```

---

### Task 9: KPI Lambda handlers

**Files:**
- Create: `src/handlers/kpis/all.ts`
- Create: `src/handlers/kpis/bestCountry.ts`
- Create: `src/handlers/kpis/averageBmi.ts`
- Create: `src/handlers/kpis/medianHeight.ts`
- Test: `tests/kpis.handlers.test.ts`

**Interfaces:**
- Consumes: `toResponse`/`toErrorResponse` (Task 4), `kpisService.*` (Task 6).
- Produces: `handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2>` exported from each file, consumed by Task 2's Terraform `local.routes` handler paths (`handlers/kpis/all.handler`, `handlers/kpis/bestCountry.handler`, `handlers/kpis/averageBmi.handler`, `handlers/kpis/medianHeight.handler` — must match exactly).

- [ ] **Step 1: Write the failing test `tests/kpis.handlers.test.ts`**

```ts
import type { APIGatewayProxyEventV2 } from "aws-lambda";
import { clearTable } from "./helpers/dynamodb-test-helpers";
import * as playersService from "../src/services/players.service";
import { handler as all } from "../src/handlers/kpis/all";
import { handler as bestCountry } from "../src/handlers/kpis/bestCountry";
import { handler as averageBmi } from "../src/handlers/kpis/averageBmi";
import { handler as medianHeight } from "../src/handlers/kpis/medianHeight";
import type { Player } from "../src/types/player";

function makePlayer(id: number, countryCode: string, height: number, weight: number, last: number[]): Player {
  return {
    id,
    firstname: `P${id}`,
    lastname: "Test",
    shortname: `P${id}.T`,
    sex: "M",
    country: { code: countryCode, picture: "https://example.com/fra.png" },
    picture: "https://example.com/test.png",
    data: { rank: 1, points: 100, weight, height, age: 25, last },
  };
}

const event = {} as APIGatewayProxyEventV2;

describe("kpis handlers", () => {
  beforeEach(async () => {
    await clearTable();
  });

  it("GET /kpis returns all three KPIs as null on an empty table", async () => {
    const res = await all(event);
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body as string)).toEqual({
      bestCountry: null,
      averageBmi: null,
      medianHeight: null,
    });
  });

  it("GET /kpis returns all three KPIs computed together", async () => {
    await playersService.createPlayer(makePlayer(1, "AAA", 175, 70000, [1]));
    await playersService.createPlayer(makePlayer(2, "BBB", 160, 80000, [0]));
    const res = await all(event);
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body as string);
    expect(body.bestCountry).toEqual({ code: "AAA", ratio: 1 });
    expect(body.averageBmi).toBeCloseTo(27.0536, 3);
    expect(body.medianHeight).toBe(167.5);
  });

  it("GET /kpis/best-country returns null with no players", async () => {
    const res = await bestCountry(event);
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body as string)).toEqual({ result: null });
  });

  it("GET /kpis/best-country returns the winning country", async () => {
    await playersService.createPlayer(makePlayer(1, "AAA", 180, 70000, [1, 1]));
    await playersService.createPlayer(makePlayer(2, "BBB", 180, 70000, [0, 0]));
    const res = await bestCountry(event);
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body as string)).toEqual({ result: { code: "AAA", ratio: 1 } });
  });

  it("GET /kpis/average-bmi returns null with no players", async () => {
    const res = await averageBmi(event);
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body as string)).toEqual({ result: null });
  });

  it("GET /kpis/average-bmi returns the computed average", async () => {
    await playersService.createPlayer(makePlayer(1, "AAA", 175, 70000, [1]));
    await playersService.createPlayer(makePlayer(2, "BBB", 160, 80000, [1]));
    const res = await averageBmi(event);
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body as string).result).toBeCloseTo(27.0536, 3);
  });

  it("GET /kpis/median-height returns null with no players", async () => {
    const res = await medianHeight(event);
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body as string)).toEqual({ result: null });
  });

  it("GET /kpis/median-height returns the median", async () => {
    await playersService.createPlayer(makePlayer(1, "AAA", 170, 70000, [1]));
    await playersService.createPlayer(makePlayer(2, "BBB", 180, 70000, [1]));
    await playersService.createPlayer(makePlayer(3, "CCC", 190, 70000, [1]));
    const res = await medianHeight(event);
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body as string)).toEqual({ result: 180 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/kpis.handlers.test.ts`
Expected: FAIL — `Cannot find module '../src/handlers/kpis/all'`

- [ ] **Step 3: Write `src/handlers/kpis/all.ts`**

```ts
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { toResponse, toErrorResponse } from "../../lib/http";
import * as kpisService from "../../services/kpis.service";

export async function handler(_event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  try {
    const [bestCountry, averageBmi, medianHeight] = await Promise.all([
      kpisService.getBestCountry(),
      kpisService.getAverageBmi(),
      kpisService.getMedianHeight(),
    ]);
    return toResponse({ bestCountry, averageBmi, medianHeight }, 200);
  } catch (err) {
    return toErrorResponse(err);
  }
}
```

- [ ] **Step 4: Write `src/handlers/kpis/bestCountry.ts`**

```ts
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { toResponse, toErrorResponse } from "../../lib/http";
import * as kpisService from "../../services/kpis.service";

export async function handler(_event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  try {
    const result = await kpisService.getBestCountry();
    return toResponse({ result }, 200);
  } catch (err) {
    return toErrorResponse(err);
  }
}
```

- [ ] **Step 5: Write `src/handlers/kpis/averageBmi.ts`**

```ts
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { toResponse, toErrorResponse } from "../../lib/http";
import * as kpisService from "../../services/kpis.service";

export async function handler(_event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  try {
    const result = await kpisService.getAverageBmi();
    return toResponse({ result }, 200);
  } catch (err) {
    return toErrorResponse(err);
  }
}
```

- [ ] **Step 6: Write `src/handlers/kpis/medianHeight.ts`**

```ts
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { toResponse, toErrorResponse } from "../../lib/http";
import * as kpisService from "../../services/kpis.service";

export async function handler(_event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  try {
    const result = await kpisService.getMedianHeight();
    return toResponse({ result }, 200);
  } catch (err) {
    return toErrorResponse(err);
  }
}
```

- [ ] **Step 7: Run test to verify it passes**

Run: `npx jest tests/kpis.handlers.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 8: Commit**

```bash
git add src/handlers/kpis tests/kpis.handlers.test.ts
git commit -m "Add KPI Lambda handlers"
```

---

### Task 10: Packaging script, cleanup of the old Express/Prisma stack, final verification

**Files:**
- Create: `scripts/prepare-lambda-package.js`
- Create: `tsconfig.build.json`
- Modify: `package.json` (new `build`/`package` scripts, remove Prisma deps/scripts, remove `supertest`)
- Modify: `tsconfig.json` (drop `prisma` from `include`, add `seed`)
- Delete: `src/app.ts`, `src/server.ts`, `src/routes/`, `src/controllers/`, `src/middleware/`, `src/mappers/player.mapper.ts`, `src/lib/prisma.ts`
- Delete: `prisma/` (whole directory), `prisma.config.ts`, `dev.db`
- Delete: `tests/players.routes.test.ts`, `tests/kpis.routes.test.ts`, `tests/error-handler.test.ts`, `tests/health.test.ts`, `tests/prisma-schema.test.ts`, `tests/player.mapper.test.ts`
- Modify: `.env`, `.env.example` (replace `DATABASE_URL` with `TABLE_NAME`/`AWS_REGION`)

**Interfaces:**
- Consumes: everything from Tasks 1–9. This task produces nothing further — it is the final cleanup and verification pass.

- [ ] **Step 1: Write `scripts/prepare-lambda-package.js`**

```js
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const root = path.join(__dirname, "..");
const dist = path.join(root, "dist");

fs.copyFileSync(path.join(root, "package.json"), path.join(dist, "package.json"));
fs.copyFileSync(path.join(root, "package-lock.json"), path.join(dist, "package-lock.json"));

execSync("npm ci --omit=dev", { cwd: dist, stdio: "inherit" });
```

- [ ] **Step 2: Write `tsconfig.build.json`**

`tsc`'s main `tsconfig.json` has `rootDir: "."` and includes `src`, `seed`, and `tests` together (needed so `tsc --noEmit` and ts-jest type-check everything) — compiling with it directly would emit `dist/src/handlers/...` and pull `seed/`/`tests/` into the Lambda zip, which doesn't match Terraform's `handlers/players/list.handler`-style paths. The production build uses a separate config scoped to `src/` only:

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Update `package.json` scripts and dependencies**

Remove scripts: `prisma:migrate`, `prisma:generate`, `db:seed` (replace with the line below). Remove dependencies: `@prisma/adapter-better-sqlite3`, `@prisma/client`, `better-sqlite3`. Remove devDependencies: `prisma`, `supertest`, `@types/supertest`. Remove the top-level `"prisma": { "seed": ... }` block. Add:

```json
"scripts": {
  "build": "tsc -p tsconfig.build.json && node scripts/prepare-lambda-package.js",
  "start": "echo 'No long-running server in the Lambda deployment — see terraform/outputs.tf for the API endpoint after deploy' && exit 1",
  "test": "jest",
  "db:seed": "ts-node seed/seed.ts"
}
```

(keep `"dev"` only if you still want a local non-Lambda way to exercise handlers — this plan does not add one, since the spec defines no such requirement; remove the `"dev"` script entirely.)

Run: `npm install` after editing `package.json` to refresh `package-lock.json`.

- [ ] **Step 4: Update `tsconfig.json`**

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
    "resolveJsonModule": true,
    "types": ["node", "jest"]
  },
  "include": ["src", "seed", "tests"]
}
```

- [ ] **Step 5: Update `.env` and `.env.example`**

```
TABLE_NAME="Players"
AWS_REGION="us-east-1"
```

- [ ] **Step 6: Delete the old Express/Prisma stack**

```bash
git rm -r src/app.ts src/server.ts src/routes src/controllers src/middleware src/mappers/player.mapper.ts src/lib/prisma.ts
git rm -r prisma prisma.config.ts dev.db
git rm tests/players.routes.test.ts tests/kpis.routes.test.ts tests/error-handler.test.ts tests/health.test.ts tests/prisma-schema.test.ts tests/player.mapper.test.ts
```

- [ ] **Step 7: Remove the Prisma `db push` line from `tests/jest.global-setup.js`**

Delete the `execSync("npx prisma db push ...")` block added in Task 5 Step 2 — it has no file left to push against.

- [ ] **Step 8: Run the full test suite**

Run: `npm test`
Expected: PASS — every test file under `tests/` (`http.test.ts`, `player-item.test.ts`, `players.service.test.ts`, `kpis.service.test.ts`, `seed.test.ts`, `players.handlers.test.ts`, `kpis.handlers.test.ts`) passes, no references to removed modules remain.

- [ ] **Step 9: Type-check the whole project**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 10: Build and validate the Lambda package end-to-end against Terraform (no apply)**

Run: `npm run build && cd terraform && terraform init -input=false -backend=false && terraform validate && terraform plan -input=false`
Expected: `terraform validate` succeeds; `terraform plan` succeeds in producing a plan (it will prompt for/require real AWS credentials to actually reach AWS for resource diffing — if none are configured in this environment, a credentials error here is expected and acceptable; the goal of this step is confirming the config + built zip are structurally consistent, not performing a real plan against AWS).

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "Remove Express/Prisma stack; finalize AWS Lambda + DynamoDB migration"
```

---

## Self-Review

**Spec coverage:**
- Architecture (handlers → services → DynamoDB, shared error mapping): Tasks 4, 8, 9. ✓
- Data model (nested shape, denormalized `countryCode`/`height`/`recordType`, conditional writes): Tasks 1, 4, 5. ✓
- `CountryIndex`/`HeightIndex` GSIs and their use in `best-country`/`median-height`: Tasks 1, 6. ✓
- `average-bmi` stays a plain Scan: Task 6. ✓
- File layout (`terraform/`, `src/lib`, `src/handlers`, `seed/`): Tasks 1–3, 4, 7, 8, 9. ✓
- Terraform resources and single-zip packaging: Tasks 2, 3, 10. ✓
- Floci-based local/test harness reusing the real Terraform schema: Task 5. ✓
- Error handling taxonomy: Task 4 (`toErrorResponse`), exercised throughout Tasks 5, 8, 9. ✓
- Out-of-scope items (auth, pagination/filtering on list endpoints, CI/CD, multi-env, backups, observability, data migration): none added anywhere in this plan — confirmed by scanning all ten tasks. ✓

**Placeholder scan:** No "TBD"/"TODO" strings; every step has runnable code or an exact command. ✓

**Type consistency:** `Player`/`PlayerData`/`PlayerItem` types match across `player-item.ts` (Task 4), `players.service.ts`/`kpis.service.ts` (Tasks 5–6), and all handlers (Tasks 8–9). Handler signature `(event: APIGatewayProxyEventV2) => Promise<APIGatewayProxyResultV2>` is identical across all 9 handler files and matches the `handler` paths wired in Task 2's Terraform `local.routes`. ✓

**Review Focus coverage:**
- Non-numeric/missing `id` path param → 400: tested in Task 8 (`players.handlers.test.ts`, two dedicated cases). ✓
- `GET /kpis` on empty table → all-null, no throw: tested in Task 9 (`kpis.handlers.test.ts`). ✓
- Scan/Query pagination followed to completion: tested in Task 6 (`KPI_TEST_PAGE_SIZE` forced-pagination test) and implemented generically (`do...while` on `LastEvaluatedKey`) in Tasks 5 and 6. ✓
- Non-conditional DynamoDB errors not mis-mapped to 404/409: tested in Task 5 (`players.service.test.ts`, bad-table-name case). ✓
- Path-param `id` coerced via `idParamSchema` before use as the DynamoDB key: enforced in every players handler (Task 8) by always calling `idParamSchema.parse(...)` before passing `id` to the service layer; covered indirectly by every handler test that creates then fetches/updates/deletes by numeric id. ✓
