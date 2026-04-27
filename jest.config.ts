import type { Config } from 'jest';

const moduleNameMapper = {
  '^@common/(.*)$': '<rootDir>/src/common/$1',
  '^@prisma-service$': '<rootDir>/src/prisma/prisma.service',
};

const tsJestConfig = {
  globals: { 'ts-jest': { tsconfig: '<rootDir>/tsconfig.test.json' } },
};

const config: Config = {
  testTimeout: 30000,
  projects: [
    {
      displayName: 'unit',
      testMatch: ['<rootDir>/src/**/*.spec.ts'],
      preset: 'ts-jest',
      testEnvironment: 'node',
      moduleNameMapper,
      ...tsJestConfig,
      clearMocks: true,
    },
    {
      displayName: 'integration',
      testMatch: ['<rootDir>/test/integration/**/*.spec.ts'],
      preset: 'ts-jest',
      testEnvironment: 'node',
      moduleNameMapper,
      ...tsJestConfig,
      setupFilesAfterEnv: ['<rootDir>/test/integration/jest.setup.ts'],
    },
    {
      displayName: 'e2e',
      testMatch: ['<rootDir>/test/e2e/**/*.e2e-spec.ts'],
      preset: 'ts-jest',
      testEnvironment: 'node',
      moduleNameMapper,
      ...tsJestConfig,
      setupFilesAfterEnv: ['<rootDir>/test/e2e/jest.setup.ts'],
    },
  ],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/main.ts',
    '!src/**/*.module.ts',
    '!src/prisma/prisma.service.ts',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
};

export default config;
