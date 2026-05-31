import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type AuthMode = "login" | "register";

function getSupabaseServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return null;
  }

  return createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export async function POST(request: Request) {
  const supabase = getSupabaseServerClient();

  if (!supabase) {
    return NextResponse.json(
      { error: "未配置 Supabase 环境变量，当前只能使用演示模式。" },
      { status: 400 },
    );
  }

  let payload: { mode?: AuthMode; email?: string; password?: string };

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "请求格式无效。" }, { status: 400 });
  }

  const mode = payload.mode;
  const email = payload.email?.trim();
  const password = payload.password ?? "";

  if (!mode || !email || !password) {
    return NextResponse.json({ error: "请完整填写邮箱和密码。" }, { status: 400 });
  }

  try {
    const result =
      mode === "login"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });

    if (result.error) {
      return NextResponse.json({ error: result.error.message, errorCode: "AUTH_ERROR" }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      mode,
      session: result.data.session
        ? {
            access_token: result.data.session.access_token,
            refresh_token: result.data.session.refresh_token,
          }
        : null,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? `认证服务连接失败：${error.message}`
            : "认证服务连接失败，请稍后重试。",
        errorCode: "SUPABASE_UNREACHABLE",
      },
      { status: 500 },
    );
  }
}
