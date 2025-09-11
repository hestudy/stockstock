// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { api } from '../services/apiClient';

const g: any = globalThis as any;

describe('services/apiClient', () => {
  beforeEach(() => {
    g.fetch = vi.fn();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('api.get returns parsed JSON on 2xx', async () => {
    (g.fetch as any).mockResolvedValue({ ok: true, json: () => Promise.resolve({ ok: 1 }) });
    const res = await api.get<{ ok: number }>('/ping');
    expect(res.ok).toBe(1);
    expect(g.fetch).toHaveBeenCalledWith(expect.stringContaining('/api/v1/ping'), expect.any(Object));
  });

  it('api.post sends body and returns parsed JSON', async () => {
    (g.fetch as any).mockResolvedValue({ ok: true, json: () => Promise.resolve({ created: true }) });
    const res = await api.post<{ created: boolean }>('/items', { a: 1 });
    expect(res.created).toBe(true);
    const [, init] = (g.fetch as any).mock.calls[0];
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify({ a: 1 }));
  });

  it('throws friendly error when response not ok and body has error.message', async () => {
    (g.fetch as any).mockResolvedValue({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ error: { message: 'Bad stuff' } }),
    });
    await expect(api.get('/bad')).rejects.toThrow('Bad stuff');
  });

  it('throws HTTP <code> when error body missing', async () => {
    (g.fetch as any).mockResolvedValue({ ok: false, status: 503, json: () => Promise.reject(new Error('no json')) });
    await expect(api.get('/down')).rejects.toThrow('HTTP 503');
  });
});
