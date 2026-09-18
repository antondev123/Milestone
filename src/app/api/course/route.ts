import { NextResponse } from "next/server";
import { DEFAULT_COURSE_ID, loadCourse } from "@/lib/course";

export async function GET() {
  return NextResponse.json(loadCourse(DEFAULT_COURSE_ID));
}
