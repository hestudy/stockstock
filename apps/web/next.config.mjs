/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  async headers() {
    // Adaptive CSP: development allows 'unsafe-eval' and ws/wss for HMR; production remains strict
    const isDev = process.env.NODE_ENV !== "production";

    const scriptSrc = ["'self'", "'unsafe-inline'", "blob:"];
    if (isDev) {
      scriptSrc.push("'unsafe-eval'");
    }

    const connectSrc = ["'self'", "https:"];
    if (isDev) {
      connectSrc.push("ws:", "wss:");
    }

    const csp = [
      "default-src 'self'",
      `script-src ${scriptSrc.join(" ")}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self'",
      `connect-src ${connectSrc.join(" ")}`,
      "worker-src 'self' blob:",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; ");

    const securityHeaders = [
      { key: "Content-Security-Policy", value: csp },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "geolocation=(), microphone=(), camera=()" },
      { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
    ];

    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
