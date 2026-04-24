import { NextResponse } from "next/server";
import { getRedis } from "@/lib/redis";
import type { Subsidy } from "../subsidies/route";

const KEY = "subsidies";
const GEMINI_MODEL = "gemini-2.5-flash";

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

    // ③ ハルシネーション抑制を強化したシステムプロンプト
    const systemPrompt = `あなたは補助金申請の専門家アシスタントです。
以下の【登録済み補助金情報】だけを唯一の情報源として回答してください。

【厳守ルール】
1. 登録済み補助金情報に記載されていない事実・金額・条件・締切日・URL等は、一切述べないこと。
2. 情報が不明・記載なしの場合は「登録情報にはその詳細が含まれていません」と明示し、推測や補完をしないこと。
3. 「おそらく」「一般的には」「通常は」等の曖昧な表現で事実を補完しないこと。
4. 補助金の金額・補助率・対象条件・申請期限は特に正確に伝えること。不明な場合は必ず「登録情報に記載なし」と答えること。
5. 登録情報にない補助金を提案しないこと。
6. フレンドリーで丁寧な日本語で回答すること。

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
