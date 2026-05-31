"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  AURA_CONFIG_STORAGE_KEY,
  defaultAuraConfig,
  type AuraConfig,
} from "@/lib/aura-config";

type AuraConfigContextValue = {
  config: AuraConfig;
  setFeishuLink: (value: string) => void;
  setArkModel: (value: string) => void;
  setArkBaseUrl: (value: string) => void;
  resetFeishuLink: () => void;
};

const AuraConfigContext = createContext<null | AuraConfigContextValue>(null);

function readStoredConfig() {
  if (typeof window === "undefined") {
    return defaultAuraConfig;
  }

  try {
    const stored = window.localStorage.getItem(AURA_CONFIG_STORAGE_KEY);
    if (!stored) {
      return defaultAuraConfig;
    }

    return { ...defaultAuraConfig, ...(JSON.parse(stored) as Partial<AuraConfig>) };
  } catch {
    return defaultAuraConfig;
  }
}

export function AuraConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState(defaultAuraConfig);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const nextConfig = readStoredConfig();
    const frame = window.requestAnimationFrame(() => {
      setConfig(nextConfig);
      setHydrated(true);
    });

    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!hydrated || typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(AURA_CONFIG_STORAGE_KEY, JSON.stringify(config));
  }, [config, hydrated]);

  const value = useMemo(
    () => ({
      config,
      setFeishuLink: (value: string) =>
        setConfig((current) => ({ ...current, feishuLink: value || defaultAuraConfig.feishuLink })),
      setArkModel: (value: string) =>
        setConfig((current) => ({ ...current, arkModel: value || defaultAuraConfig.arkModel })),
      setArkBaseUrl: (value: string) =>
        setConfig((current) => ({ ...current, arkBaseUrl: value || defaultAuraConfig.arkBaseUrl })),
      resetFeishuLink: () =>
        setConfig((current) => ({ ...current, feishuLink: defaultAuraConfig.feishuLink })),
    }),
    [config],
  );

  return <AuraConfigContext.Provider value={value}>{children}</AuraConfigContext.Provider>;
}

export function useAuraConfig() {
  const context = useContext(AuraConfigContext);

  if (!context) {
    throw new Error("useAuraConfig must be used within AuraConfigProvider");
  }

  return context;
}
