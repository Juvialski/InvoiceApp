export const DEFAULT_QA_WORKER_COUNT = 4;
export const MAX_QA_WORKER_COUNT = 4;

export function parseQaWorkerCount(value?: string): number {
  if (value === undefined) return DEFAULT_QA_WORKER_COUNT;
  const normalized = value.trim();
  if (!/^[1-4]$/.test(normalized)) return DEFAULT_QA_WORKER_COUNT;
  const parsed = Number(normalized);
  return parsed <= MAX_QA_WORKER_COUNT ? parsed : DEFAULT_QA_WORKER_COUNT;
}

/** Runs a fixed number of workers and returns one settled result per input in input order. */
export async function runWithWorkerPool<T, R>(
  items: readonly T[],
  workerCount: number,
  runItem: (item: T, index: number) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  if (!Number.isInteger(workerCount) || workerCount < 1 || workerCount > MAX_QA_WORKER_COUNT) {
    throw new RangeError(`QA worker count must be an integer from 1 to ${MAX_QA_WORKER_COUNT}.`);
  }

  const results = new Array<PromiseSettledResult<R>>(items.length);
  let nextIndex = 0;

  const worker = async (): Promise<void> => {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;
      try {
        results[index] = { status: "fulfilled", value: await runItem(items[index]!, index) };
      } catch (reason) {
        results[index] = { status: "rejected", reason };
      }
    }
  };

  const workerCountForRun = Math.min(workerCount, items.length);
  await Promise.all(Array.from({ length: workerCountForRun }, () => worker()));
  return results;
}
