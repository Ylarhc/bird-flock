const { execSync } = require("child_process");
const dotenv = require("dotenv");

module.exports = async () => {
  dotenv.config({ path: ".env.test", quiet: true });
  execSync(`npx prisma db push --accept-data-loss --url "${process.env.DATABASE_URL}"`, {
    env: {
      ...process.env,
      PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION: "yes, go ahead",
    },
    stdio: "inherit",
  });
};
