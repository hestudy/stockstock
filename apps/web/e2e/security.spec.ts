import { test, expect } from "@playwright/test";

// Security headers validation to address CSP and related controls (QA gate concerns)
// Uses Playwright's APIRequestContext via the built-in `request` fixture

test.describe("Security Headers", () => {
  test("CSP and common security headers are present", async ({ request }) => {
    const res = await request.get("/");
    expect(res.ok()).toBeTruthy();

    const headers = Object.fromEntries(
      Object.entries(res.headers()).map(([k, v]) => [k.toLowerCase(), v]),
    );

    // Content-Security-Policy
    expect(headers["content-security-policy"]).toBeTruthy();
    expect(headers["content-security-policy"]).toMatch(/default-src 'self'/);

    // X-Frame-Options
    expect(headers["x-frame-options"]).toBe("DENY");

    // X-Content-Type-Options
    expect(headers["x-content-type-options"]).toBe("nosniff");

    // Referrer-Policy
    expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");

    // Permissions-Policy
    expect(headers["permissions-policy"]).toMatch(/geolocation=\(\), microphone=\(\), camera=\(\)/);

    // Strict-Transport-Security (present even in dev per Next headers config)
    expect(headers["strict-transport-security"]).toMatch(/max-age=\d+/);
  });
});
