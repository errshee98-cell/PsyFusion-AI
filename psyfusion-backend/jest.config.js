module.exports = {
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/tests/env.setup.js'],
  testTimeout: 20000, // starting an in-memory MongoDB per test file takes a few seconds
  verbose: true,
};
