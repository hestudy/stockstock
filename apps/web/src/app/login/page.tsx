"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getSupabaseBrowserClient } from "../../services/supabaseClient";
import { getFriendlyMessage } from "../../services/errors";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const router = useRouter();
  const sp = useSearchParams();

  const reason = sp.get("reason");
  const reasonText = useMemo(() => getFriendlyMessage(reason), [reason]);

  const supabase = useMemo(() => getSupabaseBrowserClient(), []);

  const onLogin = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setMsg(null);
      if (!email || !password) {
        setMsg("请输入邮箱与密码");
        return;
      }
      setLoading(true);
      try {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          setMsg(error.message || "登录失败，请重试");
          return;
        }
        router.push("/health");
      } finally {
        setLoading(false);
      }
    },
    [email, password, router, supabase]
  );

  const onSignup = useCallback(async () => {
    setMsg(null);
    if (!email || !password) {
      setMsg("请输入邮箱与密码");
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) {
        setMsg(error.message || "注册失败，请重试");
        return;
      }
      setMsg("注册成功，如需验证，请前往邮箱完成验证后再登录。");
    } finally {
      setLoading(false);
    }
  }, [email, password, supabase]);

  return (
    <main style={{ padding: 24 }}>
      <h1>登录</h1>
      {reasonText && (
        <p style={{ background: "#fff3cd", padding: 12, border: "1px solid #ffe69c" }}>
          {reasonText}
        </p>
      )}
      <form onSubmit={onLogin} style={{ display: "grid", gap: 12, maxWidth: 360 }}>
        <input
          placeholder="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          type="password"
          placeholder="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <div style={{ display: "flex", gap: 8 }}>
          <button type="submit" disabled={loading}>
            {loading ? "登录中…" : "登录"}
          </button>
          <button type="button" onClick={onSignup} disabled={loading}>
            注册
          </button>
        </div>
      </form>
      {msg && (
        <p style={{ color: "#b42318", marginTop: 12 }}>
          {msg}
        </p>
      )}
    </main>
  );
}
