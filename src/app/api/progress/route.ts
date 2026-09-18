import { NextResponse } from "next/server";
import { actionProgress, actionReset } from "@/lib/actions";

export async function GET() {
  return NextResponse.json(actionProgress());
}

/** DELETE /api/progress — demo reset */
export async function DELETE() {
  return NextResponse.json(actionReset());
}
