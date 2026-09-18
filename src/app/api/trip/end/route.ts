import { NextResponse } from "next/server";
import { actionEndTrip } from "@/lib/actions";

export async function POST() {
  return NextResponse.json(actionEndTrip());
}
