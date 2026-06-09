"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { clearActiveUserKey } from "@/lib/learning-store";
import { getSupabaseBrowserClient, hasSupabaseEnv } from "@/lib/supabase";

export function WorkspaceSessionGuard({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [ready, setReady] = useState(!hasSupabaseEnv());

  useEffect(() => {
    const browserClient = getSupabaseBrowserClient();

    if (!hasSupabaseEnv() || !browserClient) {
      return;
    }

    const client = browserClient;

    let cancelled = false;

    async function checkSession() {
      const {
        data: { user },
      } = await client.auth.getUser();

      if (cancelled) {
        return;
      }

      if (!user) {
        clearActiveUserKey();
        router.replace("/login");
        return;
      }

      setReady(true);
    }

    void checkSession();

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) {
        clearActiveUserKey();
        router.replace("/login");
        return;
      }

      setReady(true);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [router]);

  if (!ready) {
    return null;
  }

  return <>{children}</>;
}
