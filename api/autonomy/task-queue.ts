import type { RecoveryTask } from "./types.ts";

function cloneTask(task: RecoveryTask): RecoveryTask {
	return structuredClone(task);
}

export class MemoryTaskQueue {
	private readonly tasks = new Map<string, RecoveryTask>();
	private readonly idempotencyIndex = new Map<string, string>();

	constructor(initialTasks: RecoveryTask[] = []) {
		for (const task of initialTasks) this.enqueue(task);
	}

	enqueue(task: RecoveryTask): RecoveryTask {
		const existingId = this.idempotencyIndex.get(task.idempotencyKey);
		if (existingId) {
			const existing = this.tasks.get(existingId);
			if (!existing) throw new Error("idempotency index is inconsistent");
			return cloneTask(existing);
		}
		this.tasks.set(task.id, cloneTask(task));
		this.idempotencyIndex.set(task.idempotencyKey, task.id);
		return cloneTask(task);
	}

	list(): RecoveryTask[] {
		return [...this.tasks.values()].map(cloneTask);
	}

	claimDue(
		workerId: string,
		nowIso: string,
		limit = 10,
		leaseMs = 60_000,
	): RecoveryTask[] {
		const now = Date.parse(nowIso);
		if (Number.isNaN(now)) throw new Error("nowIso must be a valid ISO date");

		const eligible = [...this.tasks.values()]
			.filter((task) => {
				if (Date.parse(task.dueAt) > now) return false;
				if (task.status === "pending") return true;
				if (
					(task.status === "leased" || task.status === "running") &&
					task.leasedAt
				) {
					return Date.parse(task.leasedAt) + leaseMs <= now;
				}
				return false;
			})
			.sort(
				(a, b) =>
					b.priority - a.priority ||
					Date.parse(a.dueAt) - Date.parse(b.dueAt) ||
					a.id.localeCompare(b.id),
			)
			.slice(0, limit);

		for (const task of eligible) {
			task.status = "leased";
			task.leasedAt = nowIso;
			task.leasedBy = workerId;
			task.attempt += 1;
		}
		return eligible.map(cloneTask);
	}

	markRunning(taskId: string, workerId: string): RecoveryTask {
		const task = this.requireTask(taskId);
		if (task.status !== "leased" || task.leasedBy !== workerId) {
			throw new Error("task is not leased by this worker");
		}
		task.status = "running";
		return cloneTask(task);
	}

	succeed(taskId: string, workerId: string, completedAt: string): RecoveryTask {
		const task = this.requireOwnedTask(taskId, workerId);
		task.status = "succeeded";
		task.completedAt = completedAt;
		return cloneTask(task);
	}

	fail(
		taskId: string,
		workerId: string,
		nowIso: string,
		error: string,
		retryDelayMs = 60_000,
	): RecoveryTask {
		const task = this.requireOwnedTask(taskId, workerId);
		task.lastError = error.slice(0, 1_000);
		task.leasedAt = undefined;
		task.leasedBy = undefined;
		if (task.attempt >= task.maxAttempts) {
			task.status = "failed";
			task.completedAt = nowIso;
		} else {
			task.status = "pending";
			task.dueAt = new Date(Date.parse(nowIso) + retryDelayMs).toISOString();
		}
		return cloneTask(task);
	}

	cancel(taskId: string, completedAt: string): RecoveryTask {
		const task = this.requireTask(taskId);
		task.status = "cancelled";
		task.completedAt = completedAt;
		return cloneTask(task);
	}

	private requireTask(taskId: string): RecoveryTask {
		const task = this.tasks.get(taskId);
		if (!task) throw new Error(`unknown task ${taskId}`);
		return task;
	}

	private requireOwnedTask(taskId: string, workerId: string): RecoveryTask {
		const task = this.requireTask(taskId);
		if (
			(task.status !== "leased" && task.status !== "running") ||
			task.leasedBy !== workerId
		) {
			throw new Error("task is not owned by this worker");
		}
		return task;
	}
}
