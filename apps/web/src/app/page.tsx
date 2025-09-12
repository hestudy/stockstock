import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "../services/supabaseServer";

export default async function HomePage() {
  const supabase = getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/health");
  }

  return (
    <main style={{ padding: 24 }}>
      <h1>Welcome</h1>
      <p>
        这是登录/欢迎页。请前往 <a href="/login">/login</a> 登录后访问受保护页面。
      </p>
    </main>
  );
}
