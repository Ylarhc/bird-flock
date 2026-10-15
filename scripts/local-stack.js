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
