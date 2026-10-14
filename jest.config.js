module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["**/tests/**/*.test.ts"],
  testPathIgnorePatterns: ["/node_modules/", "<rootDir>/.claude/"],
  setupFiles: ["<rootDir>/tests/jest.setup.js"],
  globalSetup: "<rootDir>/tests/jest.global-setup.js",
  globalTeardown: "<rootDir>/tests/jest.global-teardown.js",
  maxWorkers: 1,
};
