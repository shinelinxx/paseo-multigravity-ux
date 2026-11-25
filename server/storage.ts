import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export interface StoredBtwBranch {
  id: string;
  parentAgentId: string;
  workspaceId: string;
  helperAgentId: string;
  title: string;
  createdAt: string;
}

interface BtwStoreData {
  version: 2;
  branches: StoredBtwBranch[];
}

function getDataDir(): string {
  const fromEnv = process.env.PASEO_PLUGIN_DATA_DIR?.trim();
  if (fromEnv) return fromEnv;
  return join(homedir(), ".paseo", "plugin-data", "multigravity-ux");
}

function getBtwStorePath(): string {
  return join(getDataDir(), "btw-branches.json");
}

let writeQueue: Promise<void> = Promise.resolve();

export async function readBtwStore(): Promise<StoredBtwBranch[]> {
  try {
    const raw = await readFile(getBtwStorePath(), "utf8");
    const parsed = JSON.parse(raw) as Partial<BtwStoreData>;
    if (!Array.isArray(parsed.branches)) return [];
    return parsed.branches.filter(
      (b): b is StoredBtwBranch =>
        Boolean(
          b &&
            typeof b.id === "string" &&
            typeof b.parentAgentId === "string" &&
            typeof b.workspaceId === "string" &&
            typeof b.helperAgentId === "string",
        ),
    );
  } catch {
    return [];
  }
}

export async function mutateBtwStore(
  mutator: (branches: StoredBtwBranch[]) => StoredBtwBranch[],
): Promise<StoredBtwBranch[]> {
  let result: StoredBtwBranch[] = [];
  writeQueue = writeQueue.then(async () => {
    const current = await readBtwStore();
    const next = mutator(current);
    result = next;
    const filePath = getBtwStorePath();
    await mkdir(dirname(filePath), { recursive: true });
    const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    const payload: BtwStoreData = { version: 2, branches: next };
    await writeFile(tmpPath, JSON.stringify(payload, null, 2), "utf8");
    await rename(tmpPath, filePath);
  });
  await writeQueue;
  return result;
}
