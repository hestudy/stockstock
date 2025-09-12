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
      // 统计服务层与组件层覆盖率
      include: [
        'src/services/**',
        'src/components/**',
      ],
      thresholds: {
        lines: 70,
        statements: 70,
        functions: 70,
        // 组件内分支较少且更依赖 E2E 场景，此处阶段性放宽，后续补齐测试再提升
        branches: 60,
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
