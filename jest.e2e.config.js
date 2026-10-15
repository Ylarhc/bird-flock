module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["**/tests/e2e/**/*.e2e.test.ts"],
  maxWorkers: 1,
};
