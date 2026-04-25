import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const { password, type } = await req.json();

  if (type === "app") {
    const correct = process.env.APP_PASSWORD;
    if (!correct) return NextResponse.json({ error: "APP_PASSWORDが設定されていません" }, { status: 500 });
    if (password === correct) return NextResponse.json({ ok: true });
    return NextResponse.json({ error: "パスワードが違います" }, { status: 401 });
  }

  if (type === "admin") {
    const correct = process.env.ADMIN_PASSWORD;
    if (!correct) return NextResponse.json({ error: "ADMIN_PASSWORDが設定されていません" }, { status: 500 });
    if (password === correct) return NextResponse.json({ ok: true });
    return NextResponse.json({ error: "パスワードが違います" }, { status: 401 });
  }

  return NextResponse.json({ error: "typeが不正です" }, { status: 400 });
}
