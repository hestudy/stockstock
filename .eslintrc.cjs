/* Unified root ESLint config for monorepo */
module.exports = {
  root: true,
  ignorePatterns: ["**/node_modules/**", "**/.next/**", "**/dist/**", "**/coverage/**"],
  env: {
    es2022: true,
    node: true,
    browser: false,
  },
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
    project: false,
  },
  plugins: ["@typescript-eslint"],
  extends: ["eslint:recommended", "plugin:@typescript-eslint/recommended", "prettier"],
  rules: {
    // Prefer pragmatism in early stages; tighten later per team standards
    "@typescript-eslint/no-explicit-any": "off",
    "@typescript-eslint/no-unused-vars": [
      "error",
      { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
    ],
    "no-empty": ["error", { allowEmptyCatch: true }],
  },
  overrides: [
    // Next.js app(s)
    {
      files: ["apps/**/**/*.{ts,tsx,js,jsx}", "apps/**/**/app/**/*.{ts,tsx,js,jsx}"],
      env: { browser: true, node: true },
      extends: ["next/core-web-vitals"],
      rules: {},
    },
    // Packages (pure TS libraries)
    {
      files: ["packages/**/**/*.{ts,tsx}"],
      env: { node: true },
      rules: {},
    },
    // Test files
    {
      files: ["**/__tests__/**/*.{ts,tsx,js,jsx}", "**/*.test.{ts,tsx,js,jsx}"],
      env: { jest: false, node: true, browser: true },
      rules: {},
    },
  ],
};
