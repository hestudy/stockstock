import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getSupabaseServerClient } from "../../services/supabaseServer";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // Test bypass for E2E only (controlled via env). Do NOT enable in production.
  if (process.env.E2E_AUTH_BYPASS === "1") {
    return <>{children}</>;
  }

  // Cookie-based bypass for targeted E2E tests only
  try {
    const ck = cookies();
    const bypass = ck.get("e2e_auth_bypass")?.value;
    if (bypass === "1") {
      return <>{children}</>;
    }
  } catch {
    // no-op: headers/cookies only available in server context
  }

  const supabase = getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?reason=unauthenticated");
  }

  return <>{children}</>;
}
