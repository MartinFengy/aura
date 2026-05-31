export type ParsedFeishuTarget = {
  appToken: string;
  tableId: string;
  viewId?: string;
  wikiToken?: string;
};

const FEISHU_API_BASE = "https://open.feishu.cn/open-apis";

export function parseFeishuLink(link: string) {
  const url = new URL(link);
  const tableId = url.searchParams.get("table") ?? "";
  const viewId = url.searchParams.get("view") ?? undefined;
  const wikiMatch = url.pathname.match(/\/wiki\/([^/]+)/);
  const baseMatch = url.pathname.match(/\/base\/([^/]+)/);

  return {
    tableId,
    viewId,
    wikiToken: wikiMatch?.[1],
    appToken: baseMatch?.[1] ?? "",
  };
}

export async function getFeishuTenantAccessToken() {
  const appId = process.env.FEISHU_APP_ID;
  const appSecret = process.env.FEISHU_APP_SECRET;

  if (!appId || !appSecret) {
    throw new Error("缺少 FEISHU_APP_ID 或 FEISHU_APP_SECRET。");
  }

  const response = await fetch(`${FEISHU_API_BASE}/auth/v3/tenant_access_token/internal`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({
      app_id: appId,
      app_secret: appSecret,
    }),
  });

  const payload = (await response.json()) as {
    code?: number;
    msg?: string;
    tenant_access_token?: string;
  };

  if (!response.ok || payload.code !== 0 || !payload.tenant_access_token) {
    throw new Error(`获取飞书租户 token 失败：${payload.msg ?? response.statusText}`);
  }

  return payload.tenant_access_token;
}

async function feishuRequest<T>(params: {
  path: string;
  method?: "GET" | "POST";
  token: string;
  body?: unknown;
}) {
  const response = await fetch(`${FEISHU_API_BASE}${params.path}`, {
    method: params.method ?? "GET",
    headers: {
      Authorization: `Bearer ${params.token}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: params.body ? JSON.stringify(params.body) : undefined,
  });

  const payload = (await response.json()) as T & { code?: number; msg?: string };
  if (!response.ok || payload.code !== 0) {
    throw new Error(`飞书接口失败：${payload.msg ?? response.statusText}`);
  }

  return payload;
}

async function listFeishuTables(params: { appToken: string; token: string }) {
  const payload = await feishuRequest<{
    data?: {
      items?: Array<{ table_id?: string; name?: string }>;
    };
  }>({
    path: `/bitable/v1/apps/${params.appToken}/tables`,
    token: params.token,
  });

  return payload.data?.items ?? [];
}

export async function resolveFeishuTarget(link: string) {
  const parsed = parseFeishuLink(link);
  const token = await getFeishuTenantAccessToken();

  let appToken = parsed.appToken;
  if (!appToken) {
    if (!parsed.wikiToken) {
      throw new Error("无法从飞书链接中解析 wiki token。");
    }

    const payload = await feishuRequest<{
      data?: {
        node?: {
          obj_token?: string;
          obj_type?: string;
        };
      };
    }>({
      path: `/wiki/v2/spaces/get_node?token=${parsed.wikiToken}`,
      token,
    });

    appToken = payload.data?.node?.obj_token ?? "";
  }

  if (!appToken) {
    throw new Error("无法从飞书 Wiki 链接解析多维表格 app token。");
  }

  let tableId = parsed.tableId;
  if (!tableId) {
    const tables = await listFeishuTables({ appToken, token });
    tableId = tables[0]?.table_id ?? "";
  }

  if (!tableId) {
    throw new Error("无法自动找到飞书多维表格，请确认链接对应的是可访问的多维表格。");
  }

  return {
    ...parsed,
    appToken,
    tableId,
    token,
  };
}

export async function syncRecordsToFeishu(params: {
  link: string;
  records: Array<Record<string, string>>;
}) {
  const target = await resolveFeishuTarget(params.link);

  const body = {
    records: params.records.map((fields) => ({ fields })),
  };

  const payload = await feishuRequest<{
    data?: {
      records?: Array<{ record_id?: string }>;
    };
  }>({
    path: `/bitable/v1/apps/${target.appToken}/tables/${target.tableId}/records/batch_create`,
    method: "POST",
    token: target.token,
    body,
  });

  return {
    count: payload.data?.records?.length ?? params.records.length,
    appToken: target.appToken,
    tableId: target.tableId,
  };
}
