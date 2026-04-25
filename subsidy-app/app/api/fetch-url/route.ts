import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { url } = await req.json();
    if (!url) return NextResponse.json({ error: "URLが必要です" }, { status: 400 });

    const res = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(url)}`);
    const data = await res.json();
    if (!data.contents) throw new Error("コンテンツを取得できませんでした");

    // HTMLタグを除去してテキスト抽出（サーバーサイドなのでDOMParserは使えない）
    const text = data.contents
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (text.length < 100) throw new Error("テキストが少なすぎます");

    return NextResponse.json({ text: text.slice(0, 8000) });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
