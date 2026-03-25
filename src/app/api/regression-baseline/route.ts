import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const RELATIVE_BASELINE_PATH = "/data/regression/regression-baseline-v1.json";
const ABSOLUTE_BASELINE_PATH = join(process.cwd(), "data", "regression", "regression-baseline-v1.json");

export async function GET() {
  try {
    const raw = await readFile(ABSOLUTE_BASELINE_PATH, "utf8");
    return NextResponse.json({
      exists: true,
      path: RELATIVE_BASELINE_PATH,
      report: JSON.parse(raw)
    });
  } catch {
    return NextResponse.json(
      {
        exists: false,
        path: RELATIVE_BASELINE_PATH
      },
      { status: 404 }
    );
  }
}

export async function POST(request: NextRequest) {
  const payload = await request.json();
  await mkdir(dirname(ABSOLUTE_BASELINE_PATH), { recursive: true });
  const body = JSON.stringify(payload, null, 2);
  await writeFile(ABSOLUTE_BASELINE_PATH, body, "utf8");
  return NextResponse.json({
    ok: true,
    path: RELATIVE_BASELINE_PATH,
    bytes: Buffer.byteLength(body, "utf8")
  });
}
