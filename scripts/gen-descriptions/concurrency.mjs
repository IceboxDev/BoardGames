// Tiny promise pool: run async work over `items` with at most `limit`
// in-flight. Calls `onResult(item, result)` and `onError(item, err)` as each
// settles so the caller can stream progress to stdout — important when a
// bulk run takes 30+ minutes.

export async function runPool({ items, limit, work, onResult, onError }) {
  const queue = [...items];
  const succeeded = [];
  const failed = [];

  const workers = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (queue.length > 0) {
      const item = queue.shift();
      if (item === undefined) return;
      try {
        const result = await work(item);
        succeeded.push({ item, result });
        onResult?.(item, result);
      } catch (err) {
        failed.push({ item, err });
        onError?.(item, err);
      }
    }
  });

  await Promise.all(workers);
  return { succeeded, failed };
}
