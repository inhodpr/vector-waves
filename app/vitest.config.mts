import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: [resolve(__dirname, 'src/renderer/src/test-setup.ts')],
    alias: {
      '@renderer': resolve(__dirname, 'src/renderer/src')
    },
    server: {
      deps: {
        inline: [/@exodus\/bytes/, /html-encoding-sniffer/]
      }
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/renderer/src/**/*'],
      exclude: [
        'src/renderer/src/**/*.test.ts',
        'src/renderer/src/**/*.d.ts',
        'src/renderer/src/main.tsx',
        'src/renderer/src/env.d.ts'
      ],
      thresholds: {
        statements: 95,
        branches: 95,
        functions: 95,
        lines: 95
      }
    }
  }
});
