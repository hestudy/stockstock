import HealthCard from "../../../components/HealthCard";
import { headers } from "next/headers";

async function getHealth() {
  const h = headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("host");
  const base = host ? `${proto}://${host}` : "";
  const apiBase = process.env.NEXT_PUBLIC_API_BASE ?? "/api/v1";

  const url = base ? `${base}${apiBase}/health` : `${apiBase}/health`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    return {
      service: "web",
      status: "degraded" as const,
      details: { error: `HTTP ${res.status}` },
      ts: new Date().toISOString(),
    };
  }
  return res.json();
}

export default async function HealthPage() {
  const data = await getHealth();
  return (
    <main style={{ padding: 24 }}>
      <h1>系统健康</h1>
      <HealthCard data={data} />
    </main>
  );
}
