import { promises as fs } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { NextResponse } from "next/server";
import { buildInitialAppState } from "@/data/mock";
import {
  buildWorkbenchStateEnvelope,
  getWorkbenchStatePriority,
  isWorkbenchStateEnvelope,
  type WorkbenchStateEnvelope
} from "@/lib/workbench-persistence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function resolveWorkbenchStatePath() {
  const cwd = process.cwd();
  if (cwd.endsWith(`${path.sep}.next${path.sep}standalone`)) {
    return path.resolve(cwd, "..", "..", "data", "runtime", "workbench-state.json");
  }

  return path.join(cwd, "data", "runtime", "workbench-state.json");
}

function resolveMirrorWorkbenchStatePaths(primaryPath: string) {
  const cwd = process.cwd();
  if (cwd.endsWith(`${path.sep}.next${path.sep}standalone`)) {
    return [
      primaryPath,
      path.join(cwd, "data", "runtime", "workbench-state.json")
    ];
  }

  return [
    primaryPath,
    path.join(cwd, ".next", "standalone", "data", "runtime", "workbench-state.json")
  ];
}

const STATE_PATH = resolveWorkbenchStatePath();
const STATE_PATHS = resolveMirrorWorkbenchStatePaths(STATE_PATH);

type EnvelopeRecord = {
  envelope: WorkbenchStateEnvelope;
  path: string;
  mtimeMs: number;
  priority: number;
};

async function readEnvelopeFromPath(filePath: string): Promise<EnvelopeRecord | null> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);
    if (!isWorkbenchStateEnvelope(parsed)) return null;
    const stat = await fs.stat(filePath);
    return {
      envelope: parsed,
      path: filePath,
      mtimeMs: stat.mtimeMs,
      priority: getWorkbenchStatePriority(parsed.state)
    };
  } catch {
    return null;
  }
}

function compareEnvelopeRecords(left: EnvelopeRecord, right: EnvelopeRecord) {
  if (left.priority !== right.priority) {
    return left.priority - right.priority;
  }

  const leftSavedAt = Date.parse(left.envelope.savedAt);
  const rightSavedAt = Date.parse(right.envelope.savedAt);
  if (Number.isFinite(leftSavedAt) && Number.isFinite(rightSavedAt) && leftSavedAt !== rightSavedAt) {
    return leftSavedAt - rightSavedAt;
  }

  if (Number.isFinite(leftSavedAt) && !Number.isFinite(rightSavedAt)) return 1;
  if (!Number.isFinite(leftSavedAt) && Number.isFinite(rightSavedAt)) return -1;

  if (left.mtimeMs !== right.mtimeMs) {
    return left.mtimeMs - right.mtimeMs;
  }

  return 0;
}

function selectFreshestEnvelope(records: EnvelopeRecord[]) {
  return records.reduce<EnvelopeRecord | null>((current, next) => {
    if (!current) return next;
    return compareEnvelopeRecords(current, next) >= 0 ? current : next;
  }, null);
}

async function writeEnvelopeToPath(filePath: string, envelope: WorkbenchStateEnvelope) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.${randomUUID()}.tmp`;
  await fs.writeFile(tempPath, `${JSON.stringify(envelope, null, 2)}\n`, "utf8");
  await fs.rename(tempPath, filePath);
}

async function writeEnvelope(envelope: WorkbenchStateEnvelope) {
  const uniquePaths = Array.from(new Set(STATE_PATHS));
  await Promise.all(uniquePaths.map((filePath) => writeEnvelopeToPath(filePath, envelope)));
}

async function readEnvelope(): Promise<WorkbenchStateEnvelope | null> {
  const records = await Promise.all(STATE_PATHS.map((filePath) => readEnvelopeFromPath(filePath)));
  const validRecords = records.filter((record): record is EnvelopeRecord => Boolean(record));
  if (!validRecords.length) return null;

  const freshest = selectFreshestEnvelope(validRecords);
  if (!freshest) return null;

  const uniquePaths = Array.from(new Set(STATE_PATHS));
  await Promise.all(
    uniquePaths.map(async (filePath) => {
      if (path.resolve(filePath) === path.resolve(freshest.path)) return;
      try {
        const stat = await fs.stat(filePath).catch(() => null);
        if (!stat) {
          await writeEnvelopeToPath(filePath, freshest.envelope);
          return;
        }

        const existing = await readEnvelopeFromPath(filePath);
        if (!existing || compareEnvelopeRecords(existing, freshest) < 0) {
          await writeEnvelopeToPath(filePath, freshest.envelope);
        }
      } catch {
        await writeEnvelopeToPath(filePath, freshest.envelope);
      }
    })
  );

  return freshest.envelope;
}

export async function GET() {
  const envelope = await readEnvelope();
  if (!envelope) {
    return NextResponse.json({
      exists: false,
      state: buildInitialAppState(),
      savedAt: null
    });
  }

  return NextResponse.json({
    exists: true,
    state: envelope.state,
    savedAt: envelope.savedAt,
    schemaVersion: envelope.schemaVersion
  });
}

export async function PUT(request: Request) {
  const body = (await request.json().catch(() => null)) as { state?: unknown } | null;
  if (!body || !body.state || typeof body.state !== "object") {
    return NextResponse.json({ ok: false, error: "Missing state payload." }, { status: 400 });
  }

  const envelope = buildWorkbenchStateEnvelope(body.state as Parameters<typeof buildWorkbenchStateEnvelope>[0]);
  await writeEnvelope(envelope);

  return NextResponse.json({
    ok: true,
    savedAt: envelope.savedAt,
    schemaVersion: envelope.schemaVersion
  });
}
