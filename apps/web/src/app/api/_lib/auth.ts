import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export type Owner = { ownerId: string };

export async function getOwner(): Promise<Owner> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    throw new Error("UNAUTHENTICATED");
  }
  const cookieStore = cookies();
  const supabase = createServerClient(
    url,
    anon,
    {
      cookies: {
        get: (key: string) => cookieStore.get(key)?.value,
      },
    },
  );

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) {
    throw new Error("UNAUTHENTICATED");
  }
  if (!user) {
    throw new Error("UNAUTHENTICATED");
  }
  return { ownerId: user.id };
}
