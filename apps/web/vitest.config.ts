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
      // Only measure coverage for unit-testable source directories
      include: [
        'src/services/**',
        'src/app/api/**',
        'src/components/**',
      ],
      thresholds: {
        lines: 70,
        statements: 70,
        functions: 70,
        branches: 70,
      },
      exclude: [
        'e2e/**',
        '**/*.d.ts',
        '**/node_modules/**',
        '**/.next/**',
        // Exclude Next.js app router pages/layouts which are covered by E2E
        'src/app/**/page.tsx',
        'src/app/**/layout.tsx',
        // Exclude Playwright config and reports
        'playwright.config.ts',
        'playwright-report/**',
        // Environment-specific service clients that are hard to unit test in node env
        'src/services/supabaseClient.ts',
        'src/services/supabaseServer.ts',
      ],
    },
  },
});
