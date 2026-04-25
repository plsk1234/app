import { NextResponse } from "next/server";
import { getRedis } from "@/lib/redis";
import type { Subsidy } from "../subsidies/route";

const KEY = "subsidies";
const GEMINI_MODEL = "gemini-2.5-flash";

export async function POST(req: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "GEMINI_API_KEYが設定されていません。Vercelの環境変数を確認してください。" },
      { status: 500 }
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

    // 国の補助金（常に参照）と選択した都道府県の補助金を分けて取得
    const nationalSubsidies = allSubsidies.filter((s) => s.pref === "国");
    const prefSubsidies = allSubsidies.filter((s) => s.pref === pref);

    const nationalSource =
      nationalSubsidies.length > 0
        ? nationalSubsidies.map((s) => `【${s.name}】（対象：国）\n${s.detail}`).join("\n\n---\n\n")
        : "（国の補助金情報は登録されていません）";

    const prefSource =
      prefSubsidies.length > 0
        ? prefSubsidies.map((s) => `【${s.name}】（対象：${s.pref}）\n${s.detail}`).join("\n\n---\n\n")
        : `（${pref}の補助金情報は登録されていません）`;

    const subsidySource = `=== 国の補助金 ===\n${nationalSource}\n\n=== ${pref}の補助金 ===\n${prefSource}`;

    const systemPrompt = `あなたは補助金申請の専門家アシスタントです。
以下の【登録済み補助金情報】だけを唯一の情報源として回答してください。

【厳守ルール】
1. 登録済み補助金情報に記載されていない事実・金額・条件・締切日・URL等は、一切述べないこと。
2. 情報が不明・記載なしの場合は「登録情報にはその詳細が含まれていません」と明示し、推測や補完をしないこと。
3. 「おそらく」「一般的には」「通常は」等の曖昧な表現で事実を補完しないこと。
4. 補助金の金額・補助率・対象条件・申請期限は特に正確に伝えること。不明な場合は必ず「登録情報に記載なし」と答えること。
5. 登録情報にない補助金を提案しないこと。
6. フレンドリーで丁寧な日本語で回答すること。
7. 案件に該当する補助金が複数ある場合（国＋都道府県など）、それぞれを提案した上で、登録情報から併用可能と明確に読み取れる場合のみ「併用可能です」と伝えること。
8. 併用可否が登録情報から明確に判断できない場合は、「併用できるかは登録情報からは判断できません。各補助金の問い合わせ窓口にご確認ください。」と必ず伝えること。一般論や推測で併用の可否を答えないこと。

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
      return NextResponse.json({ error: `Gemini APIエラー (${res.status}): ${errText}` }, { status: res.status });
    }

    const data = await res.json();
    const answer = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "（応答がありませんでした）";
    return NextResponse.json({ answer });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
