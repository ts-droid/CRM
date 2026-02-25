import { NextResponse } from "next/server";
import { runReminderSweep } from "@/lib/reminders";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const result = await runReminderSweep();
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to run reminders" },
      { status: 500 }
    );
  }
}
