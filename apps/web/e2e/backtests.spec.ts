import { test, expect } from "@playwright/test";

// Minimal E2E: after auth bypass, visit (dashboard)/backtests and assert editor & template buttons are visible
// Uses cookie-based bypass supported by `(dashboard)/layout.tsx` (cookie: e2e_auth_bypass=1)

test.describe("Backtests page - strategy editor smoke", () => {
  test.beforeEach(async ({ context }) => {
    await context.addCookies([
      { name: "e2e_auth_bypass", value: "1", domain: "localhost", path: "/" },
    ]);
  });

  test("shows editor and template actions", async ({ page }) => {
    await page.goto("/backtests");

    // Editor container should be visible
    await expect(page.getByTestId("editor")).toBeVisible();

    // Template reset button should be visible
    await expect(page.getByTestId("reset-template")).toBeVisible();
  });
});
