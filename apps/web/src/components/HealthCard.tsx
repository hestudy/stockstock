type HealthData = {
  service: string;
  status: "up" | "degraded" | "down";
  details?: Record<string, any>;
  ts: string;
};

export default function HealthCard({ data }: { data: HealthData }) {
  const { service, status, ts, details } = data;
  return (
    <section style={{ border: "1px solid #ddd", padding: 16, borderRadius: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <strong>{service}</strong>
        <span>{new Date(ts).toLocaleString()}</span>
      </div>
      <p>
        状态：
        <b>
          {status === "up" && "🟢 正常"}
          {status === "degraded" && "🟠 降级"}
          {status === "down" && "🔴 不可用"}
        </b>
      </p>
      {details && (
        <pre style={{ background: "#fafafa", padding: 12, overflow: "auto" }}>
          {JSON.stringify(details, null, 2)}
        </pre>
      )}
    </section>
  );
}
