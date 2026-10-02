import test from "node:test";
import assert from "node:assert/strict";
import { runJobs } from "../web/queue.js";

const collect = () => {
  const log = {};
  return { log, onUpdate: (i, p) => (log[i] = { ...(log[i] ?? {}), ...p }) };
};

test("all jobs finish with results", async () => {
  const { log, onUpdate } = collect();
  await runJobs([1, 2, 3], async (x) => x * 2, { concurrency: 2, onUpdate });
  assert.deepEqual(Object.values(log).map((l) => [l.status, l.result]), [
    ["done", 2], ["done", 4], ["done", 6],
  ]);
});

test("one failure does not stop the others", async () => {
  const { log, onUpdate } = collect();
  await runJobs(["a", "boom", "c"], async (x) => {
    if (x === "boom") throw new Error("실패함");
    return x;
  }, { concurrency: 1, onUpdate });
  assert.equal(log[0].status, "done");
  assert.equal(log[1].status, "failed");
  assert.equal(log[1].error, "실패함");
  assert.equal(log[2].status, "done");
});

test("never exceeds the concurrency limit", async () => {
  let running = 0, peak = 0;
  await runJobs([1, 2, 3, 4, 5], async () => {
    running++; peak = Math.max(peak, running);
    await new Promise((r) => setTimeout(r, 5));
    running--;
  }, { concurrency: 2 });
  assert.equal(peak, 2);
});
