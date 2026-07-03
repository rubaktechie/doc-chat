// Per-key async queues. Tasks enqueued under the same key run strictly one
// after another; tasks under different keys run in parallel.
//
// Used to serialize FAISS index operations per user: add.py/remove.py rewrite
// the whole index file (read → mutate in memory → write), so two concurrent
// runs on the same index would each start from the same snapshot and the last
// write would silently drop the other's vectors. An in-memory queue is
// sufficient because the backend is a single Node process (a stated design
// decision); a multi-process deployment would need a cross-process lock or a
// real job queue instead.
const chains = new Map();

export function enqueue(key, task) {
  const prev = chains.get(key) || Promise.resolve();
  // Run after the predecessor settles; a predecessor's failure must not
  // poison the chain for later tasks.
  const run = prev.catch(() => {}).then(task);
  const tail = run.catch(() => {});
  chains.set(key, tail);
  // Drop the entry once the chain drains so the map doesn't grow unbounded.
  tail.then(() => {
    if (chains.get(key) === tail) chains.delete(key);
  });
  return run;
}
