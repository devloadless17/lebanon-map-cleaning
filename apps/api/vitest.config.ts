import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // The domain layer is pure: no network, no database, no framework. These tests run
    // anywhere, instantly, which is the entire point of keeping `domain/` dependency-free.
    include: ['src/**/*.spec.ts'],
    environment: 'node',
  },
});
