// @vitest-environment node
import { describe, it, expect } from "vitest";
import React from "react";
import ReactDOMServer from "react-dom/server";
import HealthCard from "../components/HealthCard";

describe("<HealthCard />", () => {
  it("renders UP state with green text", () => {
    const html = ReactDOMServer.renderToString(
      React.createElement(HealthCard, {
        data: {
          service: "api",
          status: "up",
          ts: new Date().toISOString(),
          details: { api: "up" },
        },
      }),
    );
    expect(html).toContain("🟢 正常");
  });

  it("renders degraded friendly message", () => {
    const html = ReactDOMServer.renderToString(
      React.createElement(HealthCard, {
        data: {
          service: "api",
          status: "degraded",
          ts: new Date().toISOString(),
          details: { api: "degraded" },
        },
      }),
    );
    expect(html).toContain("🟠 降级");
    expect(html).toContain("部分服务暂时不可用");
  });

  it("renders down friendly message", () => {
    const html = ReactDOMServer.renderToString(
      React.createElement(HealthCard, {
        data: {
          service: "api",
          status: "down",
          ts: new Date().toISOString(),
          details: { api: "down" },
        },
      }),
    );
    expect(html).toContain("🔴 不可用");
    expect(html).toContain("服务暂时不可用");
  });

  it("displays timestamp for last update (AC3)", () => {
    const ts = "2025-01-02T03:04:05.000Z";
    const html = ReactDOMServer.renderToString(
      React.createElement(HealthCard, {
        data: { service: "api", status: "up", ts, details: { api: "up" } },
      }),
    );
    // 使用年份作为宽松断言，避免本地化差异导致的严格格式不一致
    expect(html).toContain("2025");
  });
});
