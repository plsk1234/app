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

    const nationalSubsidies = allSubsidies.filter((s) => s.pref === "国");
    const prefSubsidies = allSubsidies.filter((s) => s.pref === pref);

    const nationalSource =
      nationalSubsidies.length > 0
        ? nationalSubsidies.map((s) => `【${s.name}】\n${s.detail}`).join("\n\n---\n\n")
        : "（登録なし）";

    const prefSource =
      prefSubsidies.length > 0
        ? prefSubsidies.map((s) => `【${s.name}】\n${s.detail}`).join("\n\n---\n\n")
        : "（登録なし）";

    const systemPrompt = `あなたは補助金申請の専門家アシスタントです。
丁寧でまじめな口調を基本としながら、ユーザーの話し方に自然に合わせてください。

## 口調のルール
- 基本は丁寧でまじめな口調
- ユーザーがカジュアルに話しかけてきたら、自然に少しくだけた口調に合わせる
- ユーザーが「もっとくだけて」「敬語やめて」と明示したらそれに従う
- ユーザーが「丁寧に話して」「なれなれしい」と言ったら元の丁寧な口調に戻す
- 補助金以外の挨拶・雑談・アプリの使い方などには普通に答えてOK
- 個人情報・政治・宗教など繊細な話題は「それは私の専門外になりますので」と自然にかわす

## 補助金回答のルール（必ず守ること）
補助金に関する質問は、以下の【登録補助金情報】だけを根拠に答えること。

### 回答は状況に応じて2段階または1段階にすること

【複数の補助金が該当する場合 → 2段階】
- 第1段階：該当補助金の名前と1行概要だけを番号付きリストで提示し、「詳しく知りたいものの番号を教えてください」と促す
- 第2段階：ユーザーが番号を選んだら、その補助金だけの詳細を説明する
- 例：
  「該当しそうな補助金が2件あります。
  ① ものづくり補助金 — 製造業向け設備投資補助
  ② 東京都省エネ補助 — 省エネ設備導入支援
  詳しく知りたいものの番号を教えてください！」

【該当補助金が1件だけの場合 → 最初から詳細を説明】
- リスト表示は不要、直接詳細を答える

【質問がすでに具体的・限定的な場合 → 最初から詳細を説明】
- 「〇〇補助金について教えて」「補助率はいくら？」など特定の補助金や条件に絞った質問は最初から詳細に答える

### その他のルール
1. 登録情報にない金額・条件・締切・URLは絶対に言わない
2. 情報がなければ「登録情報には詳細が含まれていません」と正直に伝える
3. 推測や一般論で補助金の詳細を補完しない
4. 登録にない補助金を提案しない
5. 登録情報から明確に併用OKと読み取れる場合のみ併用可能と伝える
6. 併用可否が不明な場合は「各補助金の問い合わせ窓口にご確認ください」と伝える
7. 該当補助金がない場合は「登録された補助金の中に該当するものが見当たりません」と伝える

【対象地域】${pref}${industry ? `　業種：${industry}` : ""}

【登録補助金情報 - 国の補助金】
${nationalSource}

【登録補助金情報 - ${pref}の補助金】
${prefSource}`;

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
