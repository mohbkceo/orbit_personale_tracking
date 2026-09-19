import { defineConfig } from 'vitest/config';

export default defineConfig({ test: { setupFiles: ['./test/setup.js'], testTimeout: 30000, hookTimeout: 60000 } });
