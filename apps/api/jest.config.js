process.env.LOG_LEVEL = process.env.LOG_LEVEL || "silent"; // keep pino quiet during tests
process.env.THROTTLE_LIMIT = process.env.THROTTLE_LIMIT || "1000000"; // don't rate-limit the test suite

module.exports = {
  moduleFileExtensions: ["js", "json", "ts"],
  rootDir: "src",
  testRegex: ".*(\\.spec|-spec)\\.ts$",
  transform: { "^.+\\.ts$": "ts-jest" },
  testEnvironment: "node",
  setupFiles: ["dotenv/config"],
  globalSetup: "<rootDir>/../jest.global-setup.js",
  maxWorkers: 1,
  moduleNameMapper: { "^@kbi/shared$": "<rootDir>/../../../packages/shared/dist/index.js" },
};
