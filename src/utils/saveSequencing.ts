export type SaveOperation<T> = (previous: T | undefined) => Promise<T>;

/**
 * Queue saves independently per key. The previous value is read only when a
 * queued operation starts, after all earlier work for that key has completed.
 * A failed operation does not update persisted state, while later retries can
 * still run. Different keys never block one another.
 */
export function enqueueSerializedSave<T>(
  queues: Map<string, Promise<unknown>>,
  persisted: Map<string, T>,
  key: string,
  operation: SaveOperation<T>,
) {
  const prior = queues.get(key);
  const current = (prior || Promise.resolve())
    .catch(() => undefined)
    .then(async () => {
      const previous = persisted.get(key);
      const saved = await operation(previous);
      persisted.set(key, saved);
      return saved;
    });

  queues.set(key, current);
  void current.then(() => {
    if (queues.get(key) === current) queues.delete(key);
  }, () => {
    if (queues.get(key) === current) queues.delete(key);
  });
  return current;
}
