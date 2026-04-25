import { NextResponse } from "next/server";
import { getRedis } from "@/lib/redis";

export interface Subsidy {
  id: string;
  name: string;
  pref: string;
  detail: string;
  sourceType: "text" | "pdf" | "url";
  url?: string;
  createdAt: number;
}

const KEY = "subsidies";

// 全件取得
export async function GET() {
  try {
    const redis = getRedis();
    const raw = await redis.get(KEY);
    const subsidies: Subsidy[] = raw ? JSON.parse(raw) : [];
    return NextResponse.json(subsidies);
  } catch (e) {
    console.error("GET /api/subsidies error:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// 新規追加
export async function POST(req: Request) {
  try {
    const redis = getRedis();
    const body = await req.json();
    const { name, pref, detail, sourceType, url } = body;

    if (!name || !pref || !detail) {
      return NextResponse.json({ error: "name / pref / detail は必須です" }, { status: 400 });
    }

    const raw = await redis.get(KEY);
    const subsidies: Subsidy[] = raw ? JSON.parse(raw) : [];

    const newSubsidy: Subsidy = {
      id: Date.now().toString(),
      name,
      pref,
      detail: detail.slice(0, 8000),
      sourceType: sourceType || "text",
      url: url || "",
      createdAt: Date.now(),
    };

    subsidies.push(newSubsidy);
    await redis.set(KEY, JSON.stringify(subsidies));

    return NextResponse.json(newSubsidy);
  } catch (e) {
    console.error("POST /api/subsidies error:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
