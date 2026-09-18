import { defineConfig } from 'vitest/config';

export default defineConfig({
  // The engine is pure: no network, no database, no framework. These run anywhere, instantly.
  test: { include: ['src/**/*.spec.ts'], environment: 'node' },
});
