import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "../../services/supabaseServer";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?reason=unauthenticated");
  }

  return <>{children}</>;
}
