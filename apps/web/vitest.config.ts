import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // 仅运行单元/组件/API 测试，排除 Playwright 的 e2e 测试
    exclude: [
      'e2e/**',
      'node_modules/**',
      'dist/**',
      '.next/**',
    ],
    environment: 'node',
    coverage: {
      enabled: true,
      provider: 'v8',
      reportsDirectory: './coverage',
      reporter: ['text-summary', 'html'],
      exclude: [
        'e2e/**',
        '**/*.d.ts',
        '**/node_modules/**',
        '**/.next/**',
      ],
    },
  },
});
