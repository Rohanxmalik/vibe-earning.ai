module.exports = {
  moduleFileExtensions: ["js", "json", "ts"],
  rootDir: "src",
  testRegex: ".*(\\.spec|-spec)\\.ts$",
  transform: { "^.+\\.ts$": "ts-jest" },
  testEnvironment: "node",
  setupFiles: ["dotenv/config"],
  moduleNameMapper: { "^@kbi/shared$": "<rootDir>/../../../packages/shared/dist/index.js" },
};
