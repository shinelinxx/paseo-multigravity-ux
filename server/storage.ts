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

const storeCache = new Map<string, StoredBtwBranch[]>();
const inflightLoads = new Map<string, Promise<StoredBtwBranch[]>>();
const ensuredDirs = new Set<string>();
let writeQueue: Promise<void> = Promise.resolve();
let tmpSeq = 0;

async function readBtwStoreFromDisk(filePath: string): Promise<StoredBtwBranch[]> {
  try {
    const raw = await readFile(filePath, "utf8");
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

export async function readBtwStore(): Promise<StoredBtwBranch[]> {
  const filePath = getBtwStorePath();
  const cached = storeCache.get(filePath);
  if (cached) return cached;

  let loadPromise = inflightLoads.get(filePath);
  if (!loadPromise) {
    loadPromise = readBtwStoreFromDisk(filePath)
      .then((branches) => {
        storeCache.set(filePath, branches);
        return branches;
      })
      .finally(() => {
        inflightLoads.delete(filePath);
      });
    inflightLoads.set(filePath, loadPromise);
  }
  return loadPromise;
}

export async function mutateBtwStore(
  mutator: (branches: StoredBtwBranch[]) => StoredBtwBranch[],
): Promise<StoredBtwBranch[]> {
  const run = writeQueue.then(async (): Promise<StoredBtwBranch[]> => {
    const filePath = getBtwStorePath();
    const current = await readBtwStore();
    const next = mutator(current);
    if (next === current) {
      return current;
    }

    const dir = dirname(filePath);
    try {
      if (!ensuredDirs.has(dir)) {
        await mkdir(dir, { recursive: true });
        ensuredDirs.add(dir);
      }
      tmpSeq += 1;
      const tmpPath = `${filePath}.${process.pid}.${Date.now()}.${tmpSeq}.tmp`;
      const payload: BtwStoreData = { version: 2, branches: next };
      await writeFile(tmpPath, JSON.stringify(payload, null, 2), "utf8");
      await rename(tmpPath, filePath);
      storeCache.set(filePath, next);
      return next;
    } catch (err) {
      ensuredDirs.delete(dir);
      throw err;
    }
  });

  writeQueue = run.then(
    () => {},
    () => {},
  );
  return run;
}
