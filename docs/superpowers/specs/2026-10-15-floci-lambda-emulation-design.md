# Floci Lambda Emulation for Local Dev & E2E Tests — Design Spec

Date: 2026-10-15

## Purpose

Extend the tennis head-to-head API's local tooling (already using Floci for
a DynamoDB-only test harness, per the AWS migration spec) with real Lambda
emulation, for two additive purposes:

1. A new `npm run test:e2e` command that deploys the *full* stack (DynamoDB
   table + GSIs, IAM, all 9 Lambda functions, HTTP API Gateway) to a
   dedicated Floci instance and runs a small suite of smoke tests against it
   over real HTTP — catching wiring bugs (wrong `handler` path, a missing
   IAM permission, a real API Gateway payload shape the hand-built test
   events in `players.handlers.test.ts`/`kpis.handlers.test.ts` can't
   exercise) that no unit-level test can.
2. A new `npm run dev:local` command for interactive development: build,
   deploy the full stack to a persistent local Floci instance, seed it, and
   print a URL to `curl`/Postman against.

Neither purpose changes the existing `npm test` suite (the fast,
already-reviewed direct-function-call handler tests and DynamoDB-only
harness from the AWS migration) — both are new, opt-in, additive layers.

## Background: why Floci's Lambda emulation needs the Docker socket

During the AWS migration's Task 5, Floci's own container logs showed
repeated `java.net.SocketException: No such file or directory` errors
trying to reach `unix:///var/run/docker.sock` from inside the Floci
container — this is Floci's Lambda-emulation subsystem, which spins up a
real container per Lambda invocation (LocalStack-style), failing because
the Docker socket was never mounted into the Floci container (today's
harness only needs DynamoDB, which doesn't require it). This design mounts
the host's Docker socket into every Floci container that needs Lambda
emulation:

```
docker run -d --name <container-name> -p 4566:4566 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  floci/floci
```

## Floci's HTTP API (v2) URL convention

Confirmed from `https://floci.io/floci/services/api-gateway/`: REST API
(v1) and HTTP API (v2) use different emulated URL conventions. This
project's `terraform/apigateway.tf` defines an `aws_apigatewayv2_api`
(HTTP API), so the relevant convention is the host-based form:

```
http://{apiId}.execute-api.localhost.floci.io:4566/{stageName}/{path}
```

With a `$default` auto-deploy stage (which `terraform/apigateway.tf`
already uses), the stage segment is omitted:

```
http://{apiId}.execute-api.localhost.floci.io:4566/{path}
```

`{apiId}` is `aws_apigatewayv2_api.this.id`.

**Assumption to verify on first implementation, not blocking the design:**
Terraform's existing `api_endpoint` output
(`aws_apigatewayv2_stage.default.invoke_url`, added in the AWS migration's
Task 3) is sourced from whatever `ApiEndpoint` string the (real or
emulated) API Gateway's `CreateApi` response returns. LocalStack-style
emulators typically populate that field with their own local-hostname
convention already, which would mean the *existing* `api_endpoint` output
works unchanged for both a real AWS deploy and a Floci deploy. If Floci's
emulated response doesn't populate `ApiEndpoint` usefully, the shared
deploy module falls back to constructing the URL itself from
`aws_apigatewayv2_api.this.id` using the template above — this requires
adding a new `api_id` output to `terraform/outputs.tf` alongside the
existing `api_endpoint` one, since nothing currently exposes the bare API
ID. Add it regardless, even if the primary `api_endpoint` output turns out
to work unmodified, since it's a one-line addition and makes the fallback
available without a second round of Terraform changes if needed later.

## Architecture

```
scripts/local-stack.js          # shared module, parameterized by mode
  --mode=test-e2e                 -> tests/.e2e-state/, ephemeral container,
                                      teardown after suite
  --mode=dev                      -> .local-dev-state/, persistent container,
                                      seeds data, prints URL

npm run test:e2e   = node scripts/local-stack.js --mode=test-e2e && \
                      jest -c jest.e2e.config.js
npm run dev:local        = node scripts/local-stack.js --mode=dev
npm run dev:local:stop   = docker rm -f tennis-api-floci-dev
```

Both modes share one deploy routine:
1. Build (`npm run build`) if `dist/` is missing or stale.
2. Start a Floci container with the Docker socket mounted (name varies by
   mode: `tennis-api-floci-e2e` vs `tennis-api-floci-dev`, so a concurrent
   `npm test` / `test:e2e` / `dev:local` run never collides).
3. Wait for the container's port to accept connections (reusing the same
   `waitForPort` helper pattern from `tests/jest.global-setup.js`).
4. `terraform apply` the **full** stack (not `-target`'d to just the table,
   unlike today's `npm test` harness) against an isolated state path:
   - `test-e2e` mode: `tests/.e2e-state/terraform.tfstate`,
     `TF_DATA_DIR=tests/.e2e-state/.terraform`
   - `dev` mode: `.local-dev-state/terraform.tfstate` (gitignored, repo
     root), `TF_DATA_DIR=.local-dev-state/.terraform`

   Both reuse the existing `skip_aws_validation` Terraform variable
   (already defined for the `npm test` harness) set to `true`.
5. Read the `api_endpoint` Terraform output (with the fallback construction
   above if needed).
6. **`dev` mode only:** run `npm run db:seed` against this instance
   (pointed at it via `DYNAMODB_ENDPOINT`), then print the resolved URL and
   a couple of ready-to-paste `curl` examples, and exit — leaving the
   container running.
7. **`test-e2e` mode only:** write the resolved URL somewhere the e2e test
   suite can read it (an env var passed through, or a small JSON file under
   `tests/.e2e-state/`), then hand off to `jest -c jest.e2e.config.js`. On
   suite completion (pass or fail), remove the Floci container.

`npm run dev:local:stop` just removes the persistent dev container; state
files are left on disk (gitignored) so a subsequent `dev:local` run without
first stopping reuses the same Terraform state and DynamoDB data rather
than starting fresh — if the container's gone, the next `apply` simply
recreates the real resources into the same state addresses.

## The e2e test suite

```
tests/
  e2e/
    api.e2e.test.ts
jest.e2e.config.js
```

`jest.e2e.config.js` extends the base Jest config but overrides
`testMatch` to `["**/tests/e2e/**/*.e2e.test.ts"]` and has no
`globalSetup`/`globalTeardown` of its own — `scripts/local-stack.js`
*is* this suite's setup/teardown, invoked by the npm script around the
`jest` call, not through Jest's own lifecycle hooks (since the same deploy
routine is shared with `dev` mode, which isn't a Jest run at all).

`tests/e2e/api.e2e.test.ts` contains one smoke test per route (9 total):
a real `fetch()`/`http` call against the resolved API URL, asserting status
code and response shape. Happy-path only — validation edge cases
(malformed body, missing id, duplicate id, etc.) are already covered in
depth by the existing `players.handlers.test.ts`/`kpis.handlers.test.ts`;
this suite's only job is proving the real Lambda→API Gateway→DynamoDB
wiring works end to end, which those hand-built-event tests structurally
cannot do (they construct `APIGatewayProxyEventV2` objects by hand and
call the handler function directly — they never go through a real Lambda
invocation or the API Gateway payload-serialization step).

## Terraform changes

None to the resource definitions themselves — `terraform/` already defines
the full stack from the AWS migration (table/GSIs, IAM, 9 Lambda functions,
HTTP API Gateway). The only change is *how* it gets applied in these two
new modes: full `apply` (no `-target`) against a dedicated state path, with
`skip_aws_validation=true`, same as described above.

## Out of scope

- CI integration for `test:e2e` — it's a manual/on-demand command, same
  spirit as the AWS migration's "you deploy yourself" decision.
- Hot-reload for `dev:local` — re-run the script after code changes; no
  file-watcher.
- Working around Lambda cold-start/image-pull latency on first invocation
  — expected Floci/LocalStack-style behavior, not something this design
  optimizes.
- Any change to the existing `npm test` harness or its DynamoDB-only Floci
  instance — fully untouched by this work.
