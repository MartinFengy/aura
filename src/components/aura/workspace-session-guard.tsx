"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { clearActiveUserKey } from "@/lib/learning-store";
import { getSupabaseBrowserClient, hasSupabaseEnv } from "@/lib/supabase";

const LOCAL_DEV_BYPASS_KEY = "aura-local-dev-bypass";

function canUseLocalBypass() {
  if (typeof window === "undefined") {
    return false;
  }

  const isLocalHost =
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1";

  return isLocalHost && window.localStorage.getItem(LOCAL_DEV_BYPASS_KEY) === "1";
}

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
      if (canUseLocalBypass()) {
        setReady(true);
        return;
      }

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
      if (canUseLocalBypass()) {
        setReady(true);
        return;
      }

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
