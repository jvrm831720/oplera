import { expect, test } from "bun:test";
import { PostgresTaskQueue } from "../../api/autonomy/postgres-task-queue.ts";
import type { RecoveryTask } from "../../api/autonomy/types.ts";
import {
	createDatabaseClient,
	requireDatabaseUrl,
} from "../../api/db/client.ts";

const postgresTest = process.env.DATABASE_URL ? test : test.skip;
const NOW = "2026-09-06T12:00:00.000Z";

function task(overrides: Partial<RecoveryTask> = {}): RecoveryTask {
	const suffix = crypto.randomUUID();
	return {
		id: `task-${suffix}`,
		opportunityId: `opp-${suffix}`,
		recoverySessionId: `session-${suffix}`,
		taskType: "send_message",
		payload: { strategy: "proposal_followup" },
		priority: 100,
		dueAt: "2026-09-06T11:00:00.000Z",
		attempt: 0,
		maxAttempts: 3,
		createdAt: "2026-09-06T10:00:00.000Z",
		status: "pending",
		idempotencyKey: `idem-${suffix}`,
		...overrides,
	};
}

postgresTest(
	"postgres queue leases one task to exactly one concurrent worker",
	async () => {
		const url = requireDatabaseUrl();
		const sqlA = createDatabaseClient(url);
		const sqlB = createDatabaseClient(url);
		try {
			const queueA = new PostgresTaskQueue(sqlA, "test");
			const queueB = new PostgresTaskQueue(sqlB, "test");
			const pending = task();
			await queueA.enqueue(pending);

			const [claimedA, claimedB] = await Promise.all([
				queueA.claimDue("worker-a", NOW, 1),
				queueB.claimDue("worker-b", NOW, 1),
			]);
			const claimed = [...claimedA, ...claimedB];
			expect(claimed).toHaveLength(1);
			expect(claimed[0]?.id).toBe(pending.id);
			expect(["worker-a", "worker-b"]).toContain(claimed[0]?.leasedBy);
		} finally {
			await Promise.all([sqlA.close(), sqlB.close()]);
		}
	},
);

postgresTest("postgres queue recovers an expired lease", async () => {
	const sql = createDatabaseClient(requireDatabaseUrl());
	try {
		const queue = new PostgresTaskQueue(sql, "test");
		const pending = task();
		await queue.enqueue(pending);
		const first = await queue.claimDue("worker-a", NOW, 1, 60_000);
		expect(first[0]?.leasedBy).toBe("worker-a");

		const later = "2026-09-06T12:02:00.000Z";
		const recovered = await queue.claimDue("worker-b", later, 1, 60_000);
		expect(recovered).toHaveLength(1);
		expect(recovered[0]?.id).toBe(pending.id);
		expect(recovered[0]?.leasedBy).toBe("worker-b");
	} finally {
		await sql.close();
	}
});

postgresTest(
	"postgres queue preserves retry, max attempts, success and cancellation",
	async () => {
		const sql = createDatabaseClient(requireDatabaseUrl());
		try {
			const queue = new PostgresTaskQueue(sql, "test");
			const retryTask = task({ maxAttempts: 2 });
			await queue.enqueue(retryTask);
			await queue.claimDue("worker-retry", NOW, 1);
			await queue.markRunning(retryTask.id, "worker-retry");
			const retry = await queue.fail(
				retryTask.id,
				"worker-retry",
				NOW,
				"provider_timeout",
				60_000,
			);
			expect(retry.status).toBe("pending");
			expect(retry.dueAt).toBe("2026-09-06T12:01:00.000Z");

			await queue.claimDue("worker-retry", "2026-09-06T12:01:00.000Z", 1);
			await queue.markRunning(retryTask.id, "worker-retry");
			const failed = await queue.fail(
				retryTask.id,
				"worker-retry",
				"2026-09-06T12:01:00.000Z",
				"provider_timeout_again",
			);
			expect(failed.status).toBe("failed");
			expect(failed.attempt).toBe(2);

			const successTask = task();
			await queue.enqueue(successTask);
			await queue.claimDue("worker-success", NOW, 1);
			await queue.markRunning(successTask.id, "worker-success");
			const succeeded = await queue.succeed(
				successTask.id,
				"worker-success",
				NOW,
			);
			expect(succeeded.status).toBe("succeeded");

			const cancelTask = task();
			await queue.enqueue(cancelTask);
			const cancelled = await queue.cancel(cancelTask.id, NOW);
			expect(cancelled.status).toBe("cancelled");
		} finally {
			await sql.close();
		}
	},
);

postgresTest(
	"postgres queue preserves idempotency, ordering and due_at",
	async () => {
		const sql = createDatabaseClient(requireDatabaseUrl());
		try {
			const queue = new PostgresTaskQueue(sql, "test");
			const idempotencyKey = `idem-shared-${crypto.randomUUID()}`;
			const original = task({ idempotencyKey, priority: 10 });
			const duplicate = task({ idempotencyKey, priority: 999 });
			const inserted = await queue.enqueue(original);
			const deduplicated = await queue.enqueue(duplicate);
			expect(deduplicated.id).toBe(inserted.id);

			const low = task({ priority: 20 });
			const high = task({ priority: 900 });
			const future = task({
				priority: 1000,
				dueAt: "2026-09-06T13:00:00.000Z",
			});
			await queue.enqueue(low);
			await queue.enqueue(high);
			await queue.enqueue(future);
			const claimed = await queue.claimDue("worker-order", NOW, 10);
			const relevant = claimed.filter(
				(item) => item.id === low.id || item.id === high.id,
			);
			expect(relevant.map((item) => item.id)).toEqual([high.id, low.id]);
			expect(claimed.some((item) => item.id === future.id)).toBe(false);
		} finally {
			await sql.close();
		}
	},
);

postgresTest(
	"postgres queue survives process-style client restart",
	async () => {
		const url = requireDatabaseUrl();
		const sqlA = createDatabaseClient(url);
		const queueA = new PostgresTaskQueue(sqlA, "test");
		const pending = task();
		await queueA.enqueue(pending);
		await sqlA.close();

		const sqlB = createDatabaseClient(url);
		try {
			const queueB = new PostgresTaskQueue(sqlB, "test");
			const tasks = await queueB.list();
			expect(tasks.some((item) => item.id === pending.id)).toBe(true);
		} finally {
			await sqlB.close();
		}
	},
);
