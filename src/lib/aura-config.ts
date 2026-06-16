export const DEFAULT_FEISHU_LINK =
  "https://my.feishu.cn/wiki/OVKxwlGHkiHmh0k6nIBcnxC3n5f?table=tblNlHHLTcNFMjrj&view=vewr8uJImR";

export const AURA_CONFIG_STORAGE_KEY = "aura-agent-config";

export const ARK_MODEL_OPTIONS = [
  {
    label: "Doubao-Seed-2.0-pro",
    value: "doubao-seed-2-0-pro",
    apiModel: "doubao-seed-2-0-pro-260215",
    provider: "ark",
    defaultBaseUrl: "https://ark.cn-beijing.volces.com/api/v3",
    detailUrl:
      "https://console.volcengine.com/ark/region:ark+cn-beijing/model/detail?Id=doubao-seed-2-0-pro",
  },
  {
    label: "Doubao-Seed-2.0-lite",
    value: "doubao-seed-2-0-lite",
    apiModel: "doubao-seed-2-0-lite-260215",
    provider: "ark",
    defaultBaseUrl: "https://ark.cn-beijing.volces.com/api/v3",
    detailUrl:
      "https://console.volcengine.com/ark/region:ark+cn-beijing/model/detail?Id=doubao-seed-2-0-lite",
  },
  {
    label: "Doubao-Seed-2.0-mini",
    value: "doubao-seed-2-0-mini",
    apiModel: "doubao-seed-2-0-mini-260215",
    provider: "ark",
    defaultBaseUrl: "https://ark.cn-beijing.volces.com/api/v3",
    detailUrl:
      "https://console.volcengine.com/ark/region:ark+cn-beijing/model/detail?Id=doubao-seed-2-0-mini",
  },
  {
    label: "Doubao-Seed-2.0-Code",
    value: "doubao-seed-2-0-code",
    apiModel: "doubao-seed-2-0-code-preview-260215",
    provider: "ark",
    defaultBaseUrl: "https://ark.cn-beijing.volces.com/api/v3",
    detailUrl:
      "https://console.volcengine.com/ark/region:ark+cn-beijing/model/detail?Id=doubao-seed-2-0-code",
  },
  {
    label: "Agnes-2.0-Flash",
    value: "agnes-2.0-flash",
    apiModel: "agnes-2.0-flash",
    provider: "agnes",
    defaultBaseUrl: "https://apihub.agnes-ai.com/v1",
    detailUrl: "https://agnes-ai.com/doc/quick-start",
  },
] as const;

export function getArkModelOption(value?: string | null) {
  if (!value) {
    return null;
  }

  return (
    ARK_MODEL_OPTIONS.find((item) => item.value === value || item.apiModel === value) ?? null
  );
}

export const DEFAULT_ARK_MODEL =
  getArkModelOption(process.env.NEXT_PUBLIC_ARK_MODEL)?.value ?? "doubao-seed-2-0-pro";

export function isSupportedArkModel(value: string) {
  return getArkModelOption(value) !== null;
}

export function normalizeArkModel(value?: string | null) {
  return getArkModelOption(value)?.value ?? DEFAULT_ARK_MODEL;
}

export type AuraConfig = {
  feishuLink: string;
  arkBaseUrl: string;
  arkModel: string;
};

export const defaultAuraConfig: AuraConfig = {
  feishuLink: DEFAULT_FEISHU_LINK,
  arkBaseUrl:
    process.env.NEXT_PUBLIC_ARK_BASE_URL ??
    getArkModelOption(process.env.NEXT_PUBLIC_ARK_MODEL)?.defaultBaseUrl ??
    "https://ark.cn-beijing.volces.com/api/v3",
  arkModel: normalizeArkModel(process.env.NEXT_PUBLIC_ARK_MODEL),
};
