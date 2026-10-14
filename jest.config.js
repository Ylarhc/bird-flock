module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["**/tests/**/*.test.ts"],
  setupFiles: ["<rootDir>/tests/jest.setup.js"],
  globalSetup: "<rootDir>/tests/jest.global-setup.js",
  maxWorkers: 1,
};
