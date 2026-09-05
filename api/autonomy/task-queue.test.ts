import { describe, expect, test } from "bun:test";
import { MemoryTaskQueue } from "./task-queue.ts";
import type { RecoveryTask } from "./types.ts";

const NOW = "2026-09-05T15:00:00.000Z";

function task(overrides: Partial<RecoveryTask> = {}): RecoveryTask {
	return {
		id: "task-1",
		opportunityId: "opp-1",
		recoverySessionId: "session-1",
		taskType: "send_message",
		payload: {},
		priority: 100,
		dueAt: "2026-09-05T14:00:00.000Z",
		attempt: 0,
		maxAttempts: 3,
		createdAt: "2026-09-05T13:00:00.000Z",
		status: "pending",
		idempotencyKey: "opp-1:send:1",
		...overrides,
	};
}

describe("memory task queue", () => {
	test("leases due work once for concurrent workers", () => {
		const queue = new MemoryTaskQueue([task()]);
		const first = queue.claimDue("worker-a", NOW);
		const second = queue.claimDue("worker-b", NOW);
		expect(first).toHaveLength(1);
		expect(first[0]?.leasedBy).toBe("worker-a");
		expect(second).toHaveLength(0);
	});

	test("recovers an expired lease", () => {
		const queue = new MemoryTaskQueue([
			task({
				status: "leased",
				leasedAt: "2026-09-05T14:58:00.000Z",
				leasedBy: "dead-worker",
			}),
		]);
		const claimed = queue.claimDue("worker-b", NOW, 10, 60_000);
		expect(claimed).toHaveLength(1);
		expect(claimed[0]?.leasedBy).toBe("worker-b");
	});

	test("retries a failed task until max attempts", () => {
		const queue = new MemoryTaskQueue([task()]);
		queue.claimDue("worker-a", NOW);
		queue.markRunning("task-1", "worker-a");
		const failed = queue.fail("task-1", "worker-a", NOW, "provider_timeout", 60_000);
		expect(failed.status).toBe("pending");
		expect(failed.lastError).toBe("provider_timeout");
		expect(failed.dueAt).toBe("2026-09-05T15:01:00.000Z");
	});

	test("deduplicates by idempotency key", () => {
		const queue = new MemoryTaskQueue();
		const original = queue.enqueue(task());
		const duplicate = queue.enqueue(
			task({ id: "task-duplicate", opportunityId: "opp-other" }),
		);
		expect(duplicate.id).toBe(original.id);
		expect(queue.list()).toHaveLength(1);
	});
});
