# Floci Lambda Emulation (Local Dev + E2E Tests) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add real Lambda emulation via Floci (with the host Docker socket mounted in) for two additive, opt-in workflows: `npm run test:e2e` (full-stack smoke tests over real HTTP) and `npm run dev:local` (persistent local deploy for interactive development) — without touching the existing `npm test` harness.

**Architecture:** A single shared orchestration script (`scripts/local-stack.js`), parameterized by `--mode=dev|test-e2e`, builds the Lambda package if needed, starts a Docker-socket-mounted Floci container, runs a *full* `terraform apply` (table + IAM + Lambda + API Gateway, not `-target`'d to just the table like the existing `npm test` harness) against a mode-specific isolated Terraform state path, and resolves the deployed API's URL directly from a new `api_id` Terraform output using Floci's documented HTTP API (v2) convention. `dev` mode seeds data and leaves the container running; `test-e2e` mode hands off to a dedicated Jest config and tears the container down afterward regardless of outcome.

**Tech Stack:** Node.js scripting (`child_process`), Terraform (reusing the existing `terraform/` config and `skip_aws_validation` variable), Floci (Docker image, socket-mounted), Jest (a second, separate config for e2e tests), the Node 18+ global `fetch`.

**Spec:** `docs/superpowers/specs/2026-10-15-floci-lambda-emulation-design.md`

## Global Constraints

- Every Floci container this feature starts must mount the host Docker socket: `-v /var/run/docker.sock:/var/run/docker.sock` — without it, Floci's Lambda-invocation subsystem can't spin up invocation containers (confirmed failure mode from the AWS migration's Task 5 logs).
- The existing `npm test` harness (`tests/jest.global-setup.js`, `tests/jest.global-teardown.js`, its `-target=aws_dynamodb_table.players` scoped apply, its `tests/.terraform-test-state/` path) is **not modified** by this plan, except for one line in `jest.config.js` excluding `tests/e2e/` from its `testMatch`.
- Both new modes run a **full** `terraform apply` (no `-target`), with `TF_VAR_skip_aws_validation=true` (the variable already exists from the AWS migration), each against its own isolated `TF_DATA_DIR` + `-backend-config="path=..."` pair — never `terraform/.terraform/`, never the real deploy's state, never the `npm test` harness's state.
- Floci's HTTP API (v2) URL convention (confirmed from `https://floci.io/floci/services/api-gateway/`): `http://{apiId}.execute-api.localhost.floci.io:4566/{path}`, with the stage segment omitted since this project's API Gateway uses a `$default` auto-deploy stage. `{apiId}` comes from a new `api_id` Terraform output — this plan constructs the URL directly from it rather than trusting Terraform's computed `invoke_url` output, since whether Floci's emulated API response populates that attribute in a locally-usable form is unverified and the direct construction is simpler and deterministic either way.
- `tests/e2e/*.e2e.test.ts` must never run under the default `npm test` (it requires a fully deployed stack and a resolved API URL that only `scripts/local-stack.js` provides).
- `test:e2e` mode always removes its Floci container after the suite, pass or fail. `dev` mode leaves its container running; `npm run dev:local:stop` removes it on request.

## Review Focus

- **A missing per-service AWS endpoint override breaks the full apply silently.** Unlike the existing `npm test` harness (which only ever touches DynamoDB), a full apply calls `iam`, `lambda`, `apigatewayv2`, and `logs` APIs too — each needs its own `AWS_ENDPOINT_URL_<SERVICE>` override pointed at Floci, or Terraform tries to reach the real AWS endpoint for that service with fake credentials. Pinned by: Task 2's own manual verification step (a successful `npm run dev:local` end-to-end run is the proof every needed override is present), plus an explicit troubleshooting comment in the script's source for whoever hits a gap later.
- **Two of `npm test` / `npm run dev:local` / `npm run test:e2e` running at once collide on host port 4566.** A person running two of these in different terminals would expect a clear error, not a confusing Docker failure. Pinned by: Task 2 wraps the Floci container start in a try/catch that re-throws with an explicit "port 4566 already in use — stop any other npm test / dev:local / test:e2e run first" message.
- **Re-running `dev:local` after `dev:local:stop`** (container gone, Terraform state file still present) must recreate resources via Terraform's normal plan/apply drift detection, not error with "already exists." Pinned by: Task 2's manual verification steps explicitly include stop-then-rerun as a checked scenario.
- **Running the e2e test file directly** (`npx jest -c jest.e2e.config.js`, bypassing `scripts/local-stack.js`) without `E2E_API_BASE_URL` set should fail immediately with a clear message, not a confusing network/fetch error partway through a test. Pinned by: Task 3's test file throws an explicit, readable error at module load time if the env var is missing.
- **A partially-failed e2e run can leave a player behind in the shared-id CRUD test chain** (e.g. create succeeds, a later assertion fails, delete never runs) — but since `test-e2e` mode always tears down and recreates its own Floci container and Terraform state from scratch on the *next* run, this self-heals automatically and isn't a real persistent-state risk. Documented here so a future reader doesn't need to re-derive this.

---

### Task 1: Terraform `api_id` output + state-path gitignore entries

**Files:**
- Modify: `terraform/outputs.tf`
- Modify: `.gitignore`

**Interfaces:**
- Produces: a new `api_id` Terraform output (`aws_apigatewayv2_api.this.id`), consumed by Task 2's `scripts/local-stack.js` (via `terraform output -json`) to construct the Floci-convention API URL.

- [ ] **Step 1: Add the `api_id` output to `terraform/outputs.tf`**

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

output "api_id" {
  value = aws_apigatewayv2_api.this.id
}
```

- [ ] **Step 2: Add state-path entries to `.gitignore`**

Append two lines (the existing `tests/.terraform-test-state/` line from the AWS migration stays as-is):

```
.local-dev-state/
tests/.e2e-state/
```

- [ ] **Step 3: Validate**

Run: `cd terraform && terraform init -input=false -backend=false && terraform validate`
Expected: `Success! The configuration is valid.`

- [ ] **Step 4: Commit**

```bash
git add terraform/outputs.tf .gitignore
git commit -m "Add Terraform api_id output for local Lambda emulation"
```

---

### Task 2: Shared deploy orchestration script (`scripts/local-stack.js`) + `dev` mode

**Files:**
- Create: `scripts/local-stack.js`
- Modify: `package.json` (add `dev:local`, `dev:local:stop`, `test:e2e` scripts — `test:e2e` is wired here even though its target, `jest.e2e.config.js`, doesn't exist until Task 3; that's fine, you won't run `test:e2e` in this task)

**Interfaces:**
- Produces: `scripts/local-stack.js`, invoked as `node scripts/local-stack.js --mode=dev` or `--mode=test-e2e`. In `dev` mode it builds, deploys, seeds, prints a URL, and exits leaving the container running. In `test-e2e` mode (built in Task 3) it builds, deploys, spawns Jest against `jest.e2e.config.js` with `E2E_API_BASE_URL` set, tears down, and exits with Jest's exit code.
- Consumes: `terraform/` (Task 1's `api_id` output plus the existing full stack definition from the AWS migration), `seed/seed.ts` (existing, unchanged), `src/lib/dynamodb.ts`'s env var contract (`DYNAMODB_ENDPOINT`/`TABLE_NAME`/`AWS_REGION`, existing, unchanged).

- [ ] **Step 1: Write `scripts/local-stack.js`**

```js
#!/usr/bin/env node
const { execSync, spawnSync } = require("child_process");
const net = require("net");
const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.join(__dirname, "..");
const TERRAFORM_DIR = path.join(REPO_ROOT, "terraform");

const MODE = (process.argv.find((a) => a.startsWith("--mode=")) || "").split("=")[1];
if (!["dev", "test-e2e"].includes(MODE)) {
  console.error("Usage: node scripts/local-stack.js --mode=dev|test-e2e");
  process.exit(1);
}

const MODE_CONFIG = {
  dev: {
    containerName: "tennis-api-floci-dev",
    statePath: "../.local-dev-state/terraform.tfstate",
    dataDir: "../.local-dev-state/.terraform",
  },
  "test-e2e": {
    containerName: "tennis-api-floci-e2e",
    statePath: "../tests/.e2e-state/terraform.tfstate",
    dataDir: "../tests/.e2e-state/.terraform",
  },
};

const config = MODE_CONFIG[MODE];

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

function ensureBuilt() {
  const builtHandler = path.join(REPO_ROOT, "dist", "handlers", "players", "list.js");
  if (!fs.existsSync(builtHandler)) {
    console.log("dist/ missing, building...");
    execSync("npm run build", { stdio: "inherit", cwd: REPO_ROOT });
  }
}

function startFloci() {
  try {
    execSync(`docker rm -f ${config.containerName}`, { stdio: "ignore" });
  } catch {
    // no previous container, fine
  }
  try {
    execSync(
      `docker run -d --name ${config.containerName} -p 4566:4566 ` +
        `-v /var/run/docker.sock:/var/run/docker.sock floci/floci`,
      { stdio: "inherit" }
    );
  } catch (err) {
    throw new Error(
      "Failed to start the Floci container — if this is a port conflict, " +
        "stop any other `npm test` / `npm run dev:local` / `npm run test:e2e` run first " +
        "(they all use host port 4566). Original error: " + err.message
    );
  }
}

function stopFloci() {
  try {
    execSync(`docker rm -f ${config.containerName}`, { stdio: "ignore" });
  } catch {
    // already gone, fine
  }
}

function terraformApply() {
  // Every AWS service this full apply touches needs its own Floci endpoint
  // override, unlike the npm-test harness's DynamoDB-only -target apply.
  // If `terraform apply` below hangs or errors trying to reach a real AWS
  // endpoint, the most likely cause is a missing AWS_ENDPOINT_URL_<SERVICE>
  // here for whichever resource type it was creating when it failed.
  const tfEnv = {
    ...process.env,
    AWS_ENDPOINT_URL_DYNAMODB: "http://localhost:4566",
    AWS_ENDPOINT_URL_IAM: "http://localhost:4566",
    AWS_ENDPOINT_URL_LAMBDA: "http://localhost:4566",
    AWS_ENDPOINT_URL_APIGATEWAYV2: "http://localhost:4566",
    AWS_ENDPOINT_URL_LOGS: "http://localhost:4566",
    AWS_ENDPOINT_URL_STS: "http://localhost:4566",
    AWS_ACCESS_KEY_ID: "test",
    AWS_SECRET_ACCESS_KEY: "test",
    AWS_REGION: "us-east-1",
    TF_VAR_skip_aws_validation: "true",
    TF_DATA_DIR: config.dataDir,
  };

  execSync(
    `terraform init -input=false -reconfigure -backend-config="path=${config.statePath}"`,
    { cwd: TERRAFORM_DIR, stdio: "inherit", env: tfEnv }
  );
  execSync("terraform apply -auto-approve -input=false", {
    cwd: TERRAFORM_DIR,
    stdio: "inherit",
    env: tfEnv,
  });
  const raw = execSync("terraform output -json", { cwd: TERRAFORM_DIR, env: tfEnv }).toString();
  return JSON.parse(raw);
}

function resolveApiUrl(tfOutputs) {
  const apiId = tfOutputs.api_id.value;
  return `http://${apiId}.execute-api.localhost.floci.io:4566`;
}

function seed() {
  execSync("npx ts-node seed/seed.ts", {
    stdio: "inherit",
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      DYNAMODB_ENDPOINT: "http://localhost:4566",
      TABLE_NAME: "Players",
      AWS_REGION: "us-east-1",
      AWS_ACCESS_KEY_ID: "test",
      AWS_SECRET_ACCESS_KEY: "test",
    },
  });
}

async function main() {
  ensureBuilt();
  startFloci();
  await waitForPort("localhost", 4566, 30000);
  const tfOutputs = terraformApply();
  const apiUrl = resolveApiUrl(tfOutputs);

  if (MODE === "dev") {
    seed();
    console.log(`\nLocal API ready: ${apiUrl}`);
    console.log("Try:");
    console.log(`  curl ${apiUrl}/players`);
    console.log(`  curl ${apiUrl}/kpis`);
    console.log('\nRun "npm run dev:local:stop" when done.');
    return;
  }

  // mode === "test-e2e": hand off to Jest, always tear down afterward.
  let exitCode = 1;
  try {
    const result = spawnSync("npx", ["jest", "-c", "jest.e2e.config.js"], {
      stdio: "inherit",
      cwd: REPO_ROOT,
      env: { ...process.env, E2E_API_BASE_URL: apiUrl },
    });
    exitCode = result.status ?? 1;
  } finally {
    stopFloci();
  }
  process.exit(exitCode);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Add the npm scripts to `package.json`**

```json
"scripts": {
  "build": "node -e \"require('fs').rmSync('dist',{recursive:true,force:true})\" && tsc -p tsconfig.build.json && node scripts/prepare-lambda-package.js",
  "start": "echo 'No long-running server in the Lambda deployment — see terraform/outputs.tf for the API endpoint after deploy' && exit 1",
  "test": "jest",
  "test:e2e": "node scripts/local-stack.js --mode=test-e2e",
  "dev:local": "node scripts/local-stack.js --mode=dev",
  "dev:local:stop": "docker rm -f tennis-api-floci-dev",
  "db:seed": "ts-node seed/seed.ts"
}
```

- [ ] **Step 3: Manually verify `dev` mode end-to-end**

Run: `npm run dev:local`
Expected: builds (if needed), starts the Floci container, completes a full `terraform apply` (watch the output — if it hangs or errors reaching a non-`localhost:4566` address for a specific resource, that resource's service needs an `AWS_ENDPOINT_URL_<SERVICE>` override added to `terraformApply()` above), seeds 5 players, and prints a `Local API ready: http://...` line.

Then, from a separate terminal:
```bash
curl http://<printed-api-id>.execute-api.localhost.floci.io:4566/players
```
Expected: a JSON array of 5 players (this is the real proof the Docker-socket-mounted Lambda emulation actually works end-to-end — if this call times out or 500s, re-check the socket mount and the endpoint overrides before moving on).

- [ ] **Step 4: Manually verify the stop/restart drift-recreate scenario**

Run: `npm run dev:local:stop`, then `npm run dev:local` again.
Expected: the second run completes successfully (Terraform detects the previously-applied resources are gone from the fresh Floci instance and recreates them, rather than erroring "already exists"), and the same `curl` from Step 3 works again afterward.

- [ ] **Step 5: Commit**

```bash
git add scripts/local-stack.js package.json
git commit -m "Add local-stack.js orchestration script and dev:local npm scripts"
```

---

### Task 3: `test-e2e` mode wiring + first e2e smoke test

**Files:**
- Create: `jest.e2e.config.js`
- Create: `tests/e2e/api.e2e.test.ts`
- Modify: `jest.config.js` (exclude `tests/e2e/` from the default suite)

**Interfaces:**
- Consumes: `scripts/local-stack.js --mode=test-e2e` (Task 2, already wired via the `test:e2e` npm script — its `test-e2e` branch is exercised for the first time in this task), `E2E_API_BASE_URL` (env var set by `local-stack.js`, consumed by the test file).
- Produces: nothing new for later tasks — Task 4 only adds more `it(...)` blocks to the same test file.

- [ ] **Step 1: Write `jest.e2e.config.js`**

```js
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["**/tests/e2e/**/*.e2e.test.ts"],
  maxWorkers: 1,
};
```

- [ ] **Step 2: Exclude `tests/e2e/` from the default `jest.config.js`**

```js
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["**/tests/**/*.test.ts"],
  testPathIgnorePatterns: ["/node_modules/", "<rootDir>/.claude/", "<rootDir>/tests/e2e/"],
  setupFiles: ["<rootDir>/tests/jest.setup.js"],
  globalSetup: "<rootDir>/tests/jest.global-setup.js",
  globalTeardown: "<rootDir>/tests/jest.global-teardown.js",
  maxWorkers: 1,
};
```

- [ ] **Step 3: Write `tests/e2e/api.e2e.test.ts`**

```ts
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
```

- [ ] **Step 4: Confirm the default `npm test` suite does NOT pick up the e2e test**

Run: `npm test -- --listTests`
Expected: the output lists every existing `tests/*.test.ts` file but does NOT include `tests/e2e/api.e2e.test.ts`.

- [ ] **Step 5: Run the full `test:e2e` pipeline end-to-end**

Run: `npm run test:e2e`
Expected: builds (if needed, though Task 2 already built `dist/`), deploys the full stack to a fresh `tennis-api-floci-e2e` container, runs the one test above against the real deployed API, reports `1 passed, 1 total`, then removes the container. Confirm with `docker ps -a --filter name=tennis-api-floci-e2e` afterward that no container remains.

- [ ] **Step 6: Commit**

```bash
git add jest.e2e.config.js jest.config.js tests/e2e/api.e2e.test.ts
git commit -m "Wire up test:e2e mode and the first e2e smoke test"
```

---

### Task 4: Remaining e2e smoke tests (players CRUD + all 4 KPI endpoints)

**Files:**
- Modify: `tests/e2e/api.e2e.test.ts`

**Interfaces:**
- Consumes: nothing new — same `API_BASE_URL` from Task 3.
- Produces: nothing — this is the final task.

- [ ] **Step 1: Replace `tests/e2e/api.e2e.test.ts`'s contents with the full smoke suite**

```ts
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
    const body = await res.json();
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
```

- [ ] **Step 2: Run the full suite**

Run: `npm run test:e2e`
Expected: `9 passed, 9 total`, Floci container removed afterward (confirm with `docker ps -a --filter name=tennis-api-floci-e2e`).

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/api.e2e.test.ts
git commit -m "Add remaining e2e smoke tests for players CRUD and all 4 KPI endpoints"
```

---

## Self-Review

**Spec coverage:**
- Docker socket mounted into every Floci container this feature starts: Task 2 (`startFloci()`). ✓
- Floci URL convention (host-based, stage omitted for `$default`): Task 1 (`api_id` output) + Task 2 (`resolveApiUrl`). ✓
- Shared module parameterized by mode, both `dev` and `test-e2e`: Task 2 (full script, both branches). ✓
- `dev:local` builds, deploys persistently, seeds, prints URL + curl examples: Task 2. ✓
- `dev:local:stop`: Task 2 (npm script). ✓
- `test:e2e` full-stack deploy, hands off to Jest, tears down regardless of outcome: Task 2 (`test-e2e` branch) + Task 3 (first test proves the pipeline) + Task 4 (full suite). ✓
- e2e suite excluded from default `npm test`: Task 3. ✓
- Isolated state paths for both new modes, never touching `terraform/.terraform/` or the `npm test` harness's state: Task 1 (`.gitignore`) + Task 2 (`TF_DATA_DIR`/`-backend-config` per mode). ✓
- Existing `npm test` harness untouched except the one `testPathIgnorePatterns` line: Task 3, Step 2 — confirmed no other line in `jest.config.js`, `tests/jest.global-setup.js`, or `tests/jest.global-teardown.js` is touched anywhere in this plan. ✓
- Out-of-scope items (no CI integration, no hot-reload, no cold-start optimization): none added anywhere in this plan. ✓

**Placeholder scan:** No "TBD"/"TODO" strings; every step has runnable code or an exact command, including the troubleshooting guidance for missing endpoint overrides (a real, actionable comment, not a vague "handle errors"). ✓

**Type consistency:** `scripts/local-stack.js`'s `MODE_CONFIG` keys (`dev`, `test-e2e`) match the `--mode=` values used in every npm script across Task 2 and Task 3. `tfOutputs.api_id.value` matches the exact shape `terraform output -json` produces for a single output block (`{ "api_id": { "value": "...", ... } }`), consistent with Task 1's `api_id` output definition. `E2E_API_BASE_URL` is set identically in Task 2's `spawnSync` env and read identically in Task 3/4's test file. ✓

**Review Focus coverage:**
- Missing per-service endpoint override: pinned by Task 2's manual end-to-end verification (Step 3) plus the explicit troubleshooting comment in `terraformApply()`. ✓
- Port 4566 collision: pinned by Task 2's `startFloci()` try/catch with an explicit re-thrown message. ✓
- Stop/restart drift-recreate: pinned by Task 2, Step 4's explicit manual verification. ✓
- Direct `jest -c jest.e2e.config.js` invocation without `E2E_API_BASE_URL`: pinned by Task 3's explicit module-level throw. ✓
- Partial-CRUD-chain leftover state: documented as self-healing by design (Global Constraints), not a gap needing a fix. ✓
