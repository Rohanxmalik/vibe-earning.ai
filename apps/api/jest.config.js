process.env.LOG_LEVEL = process.env.LOG_LEVEL || "silent"; // keep pino quiet during tests
process.env.THROTTLE_LIMIT = process.env.THROTTLE_LIMIT || "1000000"; // don't rate-limit the test suite
// Event impression-tokens are REQUIRED in production (secure by default); the suite opts out so
// existing event-posting specs keep exercising validity logic without minting a token each time.
// Tests that specifically cover token verification flip this back on locally.
process.env.EVENTS_REQUIRE_TOKEN = process.env.EVENTS_REQUIRE_TOKEN || "false";
process.env.EVENTS_TOKEN_SECRET = process.env.EVENTS_TOKEN_SECRET || "test-events-secret";
process.env.BCRYPT_COST = process.env.BCRYPT_COST || "4"; // fast hashing in tests (prod default is 12)

module.exports = {
  moduleFileExtensions: ["js", "json", "ts"],
  rootDir: "src",
  testRegex: ".*(\\.spec|-spec)\\.ts$",
  transform: { "^.+\\.ts$": "ts-jest" },
  testEnvironment: "node",
  setupFiles: ["dotenv/config"],
  globalSetup: "<rootDir>/../jest.global-setup.js",
  maxWorkers: 1,
  moduleNameMapper: { "^@vibearning/shared$": "<rootDir>/../../../packages/shared/dist/index.js" },
};
