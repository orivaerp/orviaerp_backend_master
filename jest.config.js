module.exports = {
  testEnvironment: 'node',
  projects: [
    {
      displayName: 'unit',
      testEnvironment: 'node',
      setupFiles: ['<rootDir>/tests/setup/env.js'],
      testMatch: ['<rootDir>/tests/unit/**/*.test.js'],
    },
    {
      displayName: 'integration',
      testEnvironment: 'node',
      setupFiles: ['<rootDir>/tests/setup/env.js'],
      setupFilesAfterEnv: ['<rootDir>/tests/setup/mongo.js'],
      testMatch: ['<rootDir>/tests/integration/**/*.test.js'],
    },
    {
      displayName: 'e2e',
      testEnvironment: 'node',
      setupFiles: ['<rootDir>/tests/setup/env.js'],
      setupFilesAfterEnv: ['<rootDir>/tests/setup/mongoPersistent.js'],
      testMatch: ['<rootDir>/tests/e2e/**/*.test.js'],
    },
  ],
};
