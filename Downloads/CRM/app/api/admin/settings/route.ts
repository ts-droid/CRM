import { NextResponse } from "next/server";
import { getResearchConfig, saveResearchConfig } from "@/lib/admin/settings";

export const dynamic = "force-dynamic";

export async function GET() {
  const config = await getResearchConfig();
  return NextResponse.json({ config });
}

export async function PUT(req: Request) {
  try {
    const body = (await req.json()) as unknown;
    const config = await saveResearchConfig(body);
    return NextResponse.json({ config });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save settings" },
      { status: 400 }
    );
  }
}
