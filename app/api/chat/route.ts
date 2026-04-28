import { NextResponse } from "next/server";
import { getRedis } from "@/lib/redis";
import type { Subsidy } from "../subsidies/route";

const KEY = "subsidies";

// ① モデル構成：第一候補 → フォールバック
const PRIMARY_MODEL   = "gemini-3.1-flash-lite-preview";
const FALLBACK_MODEL  = "gemini-3-flash-preview";
const TIMEOUT_MS      = 11000; // ③ タイムアウト11秒

// ⑧ 補助金関連キーワード（スコアリング用）
const SUBSIDY_KEYWORDS = [
  "補助", "助成", "支援", "導入", "設備", "投資", "省エネ", "LED", "太陽光",
  "蓄電池", "更新", "工事", "熱中症", "蛍光灯", "遮熱", "塗装", "断熱",
  "環境", "FIT", "給湯", "エコキュート", "企業", "事業", "オフィス", "工場",
  "倉庫", "エアコン", "空調", "照明", "再エネ", "申請", "公募", "採択", "要件",
];
const SUBSIDY_SCORE_THRESHOLD = 1;

function isSubsidyRelated(text: string): boolean {
  let score = 0;
  for (const kw of SUBSIDY_KEYWORDS) {
    if (text.includes(kw)) score++;
    if (score >= SUBSIDY_SCORE_THRESHOLD) return true;
  }
  return false;
}

// ⑥ 個人情報マスク（null/undefined安全）
function maskSensitive(text: string | null | undefined): string {
  if (!text) return "";
  return text
    .replace(/[\w.+-]+@[\w.-]+\.[a-zA-Z]{2,}/g, "[メール]")
    .replace(/0\d{1,4}[- ]?\d{1,4}[- ]?\d{4}/g, "[電話番号]")
    .replace(/https?:\/\/[^\s]*/g, "[URL]")
    .replace(/〒?\d{3}[- ]?\d{4}/g, "[郵便番号]")
    .replace(/(株式会社|有限会社|合同会社|一般社団法人|公益財団法人)/g, "[法人名]");
}

// ② Gemini呼び出し共通関数
async function callGemini(
  model: string,
  contents: { role: string; parts: { text: string }[] }[],
  apiKey: string
): Promise<string> {
  // ③ タイムアウト制御
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents }),
        signal: controller.signal,
      }
    );

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`${model}:${res.status}:${errText}`);
    }

    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error(`${model}:empty_response`);
    return text;

  } catch (e: unknown) {
    if (e instanceof Error && e.name === "AbortError") {
      throw new Error(`${model}:timeout`);
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export async function POST(req: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "GEMINI_API_KEYが設定されていません。" },
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

    // ⑥ 個人情報マスク
    const maskedMessages = messages.map(m => ({ ...m, text: maskSensitive(m.text) }));

    // ⑧ 質問分類：最新のユーザーメッセージで判定
    const latestUserText = [...maskedMessages].reverse().find(m => m.role === "user")?.text ?? "";
    const needsSubsidyData = isSubsidyRelated(latestUserText);

    // ⑦ プロンプト構築（システムプロンプトとユーザー入力を分離）
    let systemPrompt: string;

    if (!needsSubsidyData) {
      // ⑧-A 雑談・挨拶：軽量プロンプト（補助金ソースなし）
      systemPrompt = `あなたは補助金申請の専門家アシスタントです。
丁寧でまじめな口調を基本としながら、ユーザーの話し方に自然に合わせてください。
ユーザーがカジュアルに話しかけてきたら自然に合わせ、「丁寧に話して」と言われたら元の口調に戻してください。
挨拶・雑談・アプリの使い方などには普通に答えてOKです。
補助金についての質問が来たら、都道府県と案件内容を教えてもらうよう促してください。`;
    } else {
      // ⑧-B 補助金関連：補助金ソースを含む完全プロンプト
      const redis = getRedis();
      const raw = await redis.get(KEY);
      const allSubsidies: Subsidy[] = raw ? JSON.parse(raw) : [];

      const nationalSubsidies = allSubsidies.filter((s) => s.pref === "国");
      const prefSubsidies = allSubsidies.filter((s) => s.pref === pref);

      const nationalSource = nationalSubsidies.length > 0
        ? nationalSubsidies.map((s) => `【${s.name}】\n${s.detail}`).join("\n\n---\n\n")
        : "（登録なし）";

      const prefSource = prefSubsidies.length > 0
        ? prefSubsidies.map((s) => `【${s.name}】\n${s.detail}`).join("\n\n---\n\n")
        : "（登録なし）";

      systemPrompt = `あなたは補助金申請の専門家アシスタントです。
丁寧でまじめな口調を基本としながら、ユーザーの話し方に自然に合わせてください。

## 口調のルール
- 基本は丁寧でまじめな口調
- ユーザーがカジュアルに話しかけてきたら自然に合わせる
- 「丁寧に話して」「なれなれしい」と言われたら元の丁寧な口調に戻す
- 挨拶・雑談には普通に答えてOK

## 補助金回答のルール（必ず守ること）
補助金に関する質問は、以下の【登録補助金情報】だけを根拠に答えること。

### 回答は状況に応じて2段階または1段階にすること
【複数の補助金が該当する場合 → 2段階】
- 第1段階：名前と1行概要だけを番号付きリストで提示し「詳しく知りたいものの番号を教えてください」と促す
- 第2段階：ユーザーが番号を選んだらその補助金だけの詳細を説明する

【該当補助金が1件だけの場合 → 最初から詳細を説明】
【質問がすでに具体的・限定的な場合 → 最初から詳細を説明】

### その他のルール
1. 登録情報にない金額・条件・締切・URLは絶対に言わない
2. 情報がなければ「登録情報には詳細が含まれていません」と正直に伝える
3. 推測や一般論で補助金の詳細を補完しない
4. 登録にない補助金を提案しない
5. 登録情報から明確に併用OKと読み取れる場合のみ併用可能と伝える
6. 併用可否が不明な場合は「各補助金の問い合わせ窓口にご確認ください」と伝える
7. 該当補助金がない場合は「登録された補助金の中に該当するものが見当たりません」と伝える
8. 必要書類・問い合わせ窓口・申請手順は、ユーザーから聞かれた場合のみ答える。聞かれていない場合は「必要書類や申請窓口についても知りたい場合はお知らせください」と一言添える程度にとどめる

【対象地域】${pref}${industry ? `　業種：${industry}` : ""}

【登録補助金情報 - 国の補助金】
${nationalSource}

【登録補助金情報 - ${pref}の補助金】
${prefSource}`;
    }

    // ⑦ 初回メッセージにシステムプロンプトを埋め込む（ユーザー入力と分離）
    const contents = maskedMessages.map((m, i) => ({
      role: m.role,
      parts: [{
        text: i === 0 && m.role === "user"
          ? `${systemPrompt}\n\n---\n\n以下のユーザーメッセージに答えてください：\n${m.text}`
          : m.text
      }],
    }));

    // ④ フォールバックロジック
    let answer: string;
    try {
      answer = await callGemini(PRIMARY_MODEL, contents, apiKey);
    } catch (e) {
      console.error(`[fallback] Primary model failed: ${e}. Trying fallback model.`);
      try {
        answer = await callGemini(FALLBACK_MODEL, contents, apiKey);
      } catch (e2) {
        console.error(`[fallback] Fallback model also failed: ${e2}`);
        // ⑤ ユーザーにはシステム内部のエラー詳細を出さない
        return NextResponse.json(
          { error: "AI応答の取得に失敗しました。時間をおいて再度お試しください。" },
          { status: 503 }
        );
      }
    }

    return NextResponse.json({ answer });

  } catch (e) {
    console.error("POST /api/chat error:", e);
    return NextResponse.json(
      { error: "AI応答の取得に失敗しました。時間をおいて再度お試しください。" },
      { status: 500 }
    );
  }
}
