export async function runJobs(items, worker, { concurrency = 1, onUpdate = () => {} } = {}) {
  let next = 0;
  const lane = async () => {
    while (next < items.length) {
      const i = next++;
      onUpdate(i, { status: "loading" });
      try {
        onUpdate(i, { status: "done", result: await worker(items[i], i) });
      } catch (e) {
        onUpdate(i, { status: "failed", error: e.message });
      }
    }
  };
  await Promise.all(Array.from({ length: concurrency }, lane));
}
