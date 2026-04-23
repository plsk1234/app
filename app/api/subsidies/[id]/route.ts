import { NextResponse } from "next/server";
import { getRedis } from "@/lib/redis";
import type { Subsidy } from "../route";

const KEY = "subsidies";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const redis = getRedis();
    const raw = await redis.get(KEY);
    const subsidies: Subsidy[] = raw ? JSON.parse(raw) : [];
    const updated = subsidies.filter((s) => s.id !== id);
    await redis.set(KEY, JSON.stringify(updated));
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("DELETE /api/subsidies/[id] error:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
