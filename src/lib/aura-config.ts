export const DEFAULT_FEISHU_LINK =
  "https://my.feishu.cn/wiki/OVKxwlGHkiHmh0k6nIBcnxC3n5f?table=tblNlHHLTcNFMjrj&view=vewr8uJImR";

export const AURA_CONFIG_STORAGE_KEY = "aura-agent-config";

export type AuraConfig = {
  feishuLink: string;
  arkBaseUrl: string;
  arkModel: string;
};

export const defaultAuraConfig: AuraConfig = {
  feishuLink: DEFAULT_FEISHU_LINK,
  arkBaseUrl: process.env.NEXT_PUBLIC_ARK_BASE_URL ?? "https://ark.cn-beijing.volces.com/api/v3",
  arkModel: process.env.NEXT_PUBLIC_ARK_MODEL ?? "doubao-seed-2-0-code-preview-260215",
};
