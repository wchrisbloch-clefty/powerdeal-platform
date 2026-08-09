import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      // `server-only` throws outside an RSC context; see the stub's comment.
      'server-only': `${root}tests/support/server-only.ts`,
      '@': root.replace(/\/$/, ''),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
