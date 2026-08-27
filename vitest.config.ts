import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    env: {
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      DATABASE_URL:
        'postgresql://superfoods:superfoods@localhost:5433/superfoods_test?schema=public',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/generated/**', 'src/**/*.test.ts', 'src/server.ts'],
      // A ratchet, not a target: set just under current coverage so a drop
      // fails CI. Raise them as the suite grows.
      thresholds: {
        statements: 75,
        branches: 50,
        functions: 50,
        lines: 80,
      },
    },
  },
})
