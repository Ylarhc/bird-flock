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
    AWS_ENDPOINT_URL_STS: "http://localhost:4566",
    AWS_ENDPOINT_URL_IAM: "http://localhost:4566",
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
