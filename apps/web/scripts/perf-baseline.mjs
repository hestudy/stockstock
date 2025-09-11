#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3000';
const TARGET = new URL('/api/v1/health', BASE_URL).toString();
const OUT_DIR = path.join(process.cwd(), 'apps/web/perf');
const OUT_FILE = path.join(OUT_DIR, 'baseline.json');
const SAMPLES = Number(process.env.PERF_SAMPLES || 30);
const SLEEP_MS = Number(process.env.PERF_SLEEP_MS || 50);

function percentile(sorted, p) {
  if (!sorted.length) return null;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(idx, sorted.length - 1))];
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function measureOnce() {
  const t0 = performance.now();
  const res = await fetch(TARGET, { method: 'GET' });
  const t1 = performance.now();
  const ms = t1 - t0;
  let ok = res.ok;
  let status = res.status;
  return { ms, ok, status };
}

async function main() {
  const results = [];
  for (let i = 0; i < SAMPLES; i++) {
    try {
      const r = await measureOnce();
      results.push(r);
    } catch (e) {
      results.push({ ms: NaN, ok: false, status: 0, error: String(e) });
    }
    // small gap between requests to avoid tight loop interference (parameterized)
    await sleep(SLEEP_MS);
  }

  // Only compute percentiles on successful samples to avoid mixing 429/5xx noise
  const okLatencies = results.filter(r => r.ok && Number.isFinite(r.ms)).map(r => r.ms).sort((a, b) => a - b);
  const p50 = percentile(okLatencies, 50);
  const p95 = percentile(okLatencies, 95);
  const p99 = percentile(okLatencies, 99);
  const failures = results.filter(r => !r.ok).length;
  const success = results.length - failures;

  const payload = {
    target: TARGET,
    samples: SAMPLES,
    timestamp: new Date().toISOString(),
    metrics: {
      p50_ms: p50,
      p95_ms: p95,
      p99_ms: p99,
      min_ms: okLatencies[0] ?? null,
      max_ms: okLatencies.at(-1) ?? null,
      failures,
      success_rate: success / results.length,
      failure_rate: failures / results.length,
    },
    raw_sample_count: results.length,
    params: {
      samples: SAMPLES,
      sleep_ms: SLEEP_MS,
    },
  };

  await fs.mkdir(OUT_DIR, { recursive: true });
  await fs.writeFile(OUT_FILE, JSON.stringify(payload, null, 2), 'utf-8');
  console.log(`Perf baseline written to ${OUT_FILE}`);
}

main().catch((err) => {
  console.error('perf-baseline failed:', err);
  process.exit(1);
});
