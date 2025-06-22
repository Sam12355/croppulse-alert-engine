/**
 * Two projects.
 *
 * `unit` covers the pure decision logic and needs nothing. `integration` boots the real
 * Nest application in-process and drives it over HTTP with supertest, still against
 * in-memory adapters, so neither needs Postgres or Redis running.
 *
 * That is the same rule as the flagship: a suite that needs infrastructure is a suite
 * people stop running.
 */
const common = {
  transform: { '^.+\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }] },
  moduleFileExtensions: ['ts', 'js', 'json'],
  rootDir: '.',
  clearMocks: true,
};

module.exports = {
  projects: [
    { ...common, displayName: 'unit', testEnvironment: 'node', testMatch: ['<rootDir>/src/**/*.spec.ts'] },
    { ...common, displayName: 'integration', testEnvironment: 'node', testMatch: ['<rootDir>/test/**/*.spec.ts'] },
  ],
  testTimeout: 20000,
};
