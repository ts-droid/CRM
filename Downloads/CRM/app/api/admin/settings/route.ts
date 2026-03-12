import { NextResponse } from "next/server";
import { getResearchConfig, saveResearchConfig } from "@/lib/admin/settings";

// PATCH supports partial updates; currently only { brands: string[] } merging is implemented
export async function PATCH(req: Request) {
  try {
    const body = (await req.json()) as { brands?: string[] };
    if (Array.isArray(body.brands)) {
      const current = await getResearchConfig();
      const merged = Array.from(
        new Set([...current.brands, ...body.brands.map((b: string) => String(b).trim()).filter(Boolean)])
      ).slice(0, 200);
      const config = await saveResearchConfig({ ...current, brands: merged });
      return NextResponse.json({ config });
    }
    return NextResponse.json({ error: "No supported patch fields" }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to patch settings" },
      { status: 400 }
    );
  }
}

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
