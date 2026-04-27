import { NextResponse } from "next/server";
import { getRedis } from "@/lib/redis";
import type { Subsidy } from "../subsidies/route";

const KEY = "subsidies";

// モデル
const MODEL_LITE = "gemini-3.1-flash-lite-preview";
const MODEL_PRO = "gemini-3.1-flash";

// ===== タイムアウト付きfetch =====
async function fetchWithTimeout(url: string, options: any, timeout = 10000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);

  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return res;
  } finally {
    clearTimeout(id);
  }
}

// ===== 個人情報マスク（強化版）=====
function maskSensitive(text: string): string {
  return text
    // メール
    .replace(/[\w.-]+@[\w.-]+\.[a-zA-Z]{2,}/g, "[メール]")
    // 電話番号
    .replace(/0\d{1,4}[-\s]?\d{1,4}[-\s]?\d{4}/g, "[電話番号]")
    // URL
    .replace(/https?:\/\/[^\s]+/g, "[URL]")
    // 郵便番号
    .replace(/〒?\d{3}[-\s]?\d{4}/g, "[郵便番号]")
    // 法人名（前の単語も含めて消す）
    .replace(/[一-龯A-Za-z0-9・]+(株式会社|有限会社|合同会社|一般社団法人|公益財団法人)/g, "[法人名]");
}

// ===== 質問分類（スコア方式）=====
function isSubsidyQuery(text: string): boolean {
  const keywords = [
    "補助金", "助成金", "支援",
    "導入", "設備", "投資",
    "省エネ", "LED", "太陽光", "蓄電池",
    "DX", "IT導入", "ものづくり",
  ];

  let score = 0;
  for (const k of keywords) {
    if (text.includes(k)) score++;
  }

  return score >= 1; // 閾値は軽めでOK
}

// ===== 弱い回答判定 =====
function isWeakAnswer(text: string): boolean {
  if (!text) return true;

  const weakPatterns = [
    "わかりません",
    "情報がありません",
    "判断できません",
    "不明です",
  ];

  if (text.length < 40) return true;

  return weakPatterns.some(p => text.includes(p));
}

// ===== Gemini呼び出し =====
async function callGemini(apiKey: string, model: string, contents: any[]) {
  const res = await fetchWithTimeout(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents }),
    }
  );

  if (!res.ok) {
    throw new Error(`Gemini APIエラー: ${res.status}`);
  }

  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

// ===== メイン処理 =====
export async function POST(req: Request) {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { answer: "現在応答できません。管理者にお問い合わせください。" },
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
      return NextResponse.json(
        { answer: "都道府県を選択してください。" },
        { status: 400 }
      );
    }

    // ===== マスク =====
    const maskedMessages = messages.map(m => ({
      role: m.role,
      text: maskSensitive(m.text),
    }));

    const latest = maskedMessages[maskedMessages.length - 1]?.text || "";

    // ===== 分類 =====
    const subsidyMode = isSubsidyQuery(latest);

    // ===== Redis取得 =====
    const redis = getRedis();
    const raw = await redis.get(KEY);
    const allSubsidies: Subsidy[] = raw ? JSON.parse(raw) : [];

    const national = allSubsidies.filter(s => s.pref === "国");
    const prefData = allSubsidies.filter(s => s.pref === pref);

    const sourceText = subsidyMode
      ? `
【登録補助金情報 - 国】
${national.map(s => `【${s.name}】\n${s.detail}`).join("\n\n---\n\n") || "なし"}

【登録補助金情報 - ${pref}】
${prefData.map(s => `【${s.name}】\n${s.detail}`).join("\n\n---\n\n") || "なし"}
`
      : "";

    // ===== systemプロンプト =====
    const systemPrompt = subsidyMode
      ? `あなたは補助金申請の専門家です。
必ず登録情報のみを根拠に回答してください。

【ルール】
- 登録情報にないことは言わない
- 不明なら「登録情報にありません」と言う
- 複数ある場合は一覧→選択方式

${sourceText}
`
      : `あなたは親切なアシスタントです。自然に会話してください。`;

    // ===== contents構築（system分離）=====
    const contents = [
      {
        role: "user",
        parts: [{ text: systemPrompt }],
      },
      ...maskedMessages.map(m => ({
        role: m.role,
        parts: [{ text: m.text }],
      })),
    ].slice(-10);

    // ===== Lite実行 =====
    let answer = await callGemini(apiKey, MODEL_LITE, contents);

    // ===== フォールバック =====
    if (isWeakAnswer(answer)) {
      answer = await callGemini(apiKey, MODEL_PRO, contents);
    }

    return NextResponse.json({ answer });

  } catch (e) {
    console.error("APIエラー:", e);

    return NextResponse.json({
      answer: "現在応答できません。しばらくしてからお試しください。",
    });
  }
}
