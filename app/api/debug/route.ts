import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    hasGeminiKey: !!process.env.GEMINI_API_KEY,
    keyPrefix: process.env.GEMINI_API_KEY?.slice(0, 8) ?? "none",
    hasAppPassword: !!process.env.APP_PASSWORD,
    hasAdminPassword: !!process.env.ADMIN_PASSWORD,
    hasRedisUrl: !!process.env.REDIS_URL,
  });
}
