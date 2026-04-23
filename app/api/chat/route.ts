import { NextResponse } from "next/server";
import { getRedis } from "@/lib/redis";
import type { Subsidy } from "../subsidies/route";

const KEY = "subsidies";
const GEMINI_MODEL = "gemini-2.5-flash-preview-05-20";

export async function POST(req: Request) {
  const apiKey = req.headers.get("x-gemini-key") || "";
  if (!apiKey) {
    return NextResponse.json(
      { error: "Gemini APIキーが設定されていません。設定タブで入力してください。" },
      { status: 401 }
    );
  }

  try {
    const body = await req.json();
    const { messages, pref, industry } = body as {
      messages: { role: "user" | "model"; text: string }[];
      pref: string;
      industry?: string;
    };

    if (!pref) {
      return NextResponse.json({ error: "都道府県が指定されていません" }, { status: 400 });
    }

    const redis = getRedis();
    const raw = await redis.get(KEY);
    const allSubsidies: Subsidy[] = raw ? JSON.parse(raw) : [];

    const filtered = allSubsidies.filter(
      (s) => s.pref === pref || s.pref === "全国"
    );

    const subsidySource =
      filtered.length > 0
        ? filtered.map((s) => `【${s.name}】（対象：${s.pref}）\n${s.detail}`).join("\n\n---\n\n")
        : "（この地域に該当する補助金情報がまだ登録されていません）";

    const systemPrompt = `あなたは補助金の専門家アシスタントです。
ユーザーの受注案件に合う補助金を提案し、追加の質問にも答えてください。
回答は必ず以下の補助金情報だけを根拠にしてください。情報にないことは「登録情報にはその詳細がありません」と答えてください。
フレンドリーで親切な口調で、わかりやすく日本語で答えてください。

【対象地域】${pref}${industry ? `　業種：${industry}` : ""}
【登録済み補助金情報】
${subsidySource}`;

    const contents = messages.map((m, i) => ({
      role: m.role,
      parts: [{ text: i === 0 && m.role === "user" ? `${systemPrompt}\n\n---\n\n${m.text}` : m.text }],
    }));

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents }),
      }
    );

    if (!res.ok) {
      const errText = await res.text();
      console.error("Gemini API error:", res.status, errText);
      return NextResponse.json({ error: `Gemini APIエラー (${res.status}): ${errText}` }, { status: res.status });
    }

    const data = await res.json();
    const answer = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "（応答がありませんでした）";
    return NextResponse.json({ answer });
  } catch (e) {
    console.error("POST /api/chat error:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
