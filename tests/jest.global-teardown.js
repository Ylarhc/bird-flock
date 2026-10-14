const { execSync } = require("child_process");

module.exports = async () => {
  try {
    execSync("docker rm -f tennis-api-floci-test", { stdio: "ignore" });
  } catch {
    // already gone, fine
  }
};
