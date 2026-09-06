import type { DatabaseClient } from "../db/client.ts";
import type { TaskQueue } from "./task-queue.ts";
import type { RecoveryTask } from "./types.ts";

interface TaskRow {
	id: string;
	external_opportunity_id: string;
	recovery_session_id: string;
	task_type: RecoveryTask["taskType"];
	payload: Record<string, unknown> | string;
	priority: number;
	due_at: Date | string;
	status: RecoveryTask["status"];
	leased_at: Date | string | null;
	leased_by: string | null;
	attempt: number;
	max_attempts: number;
	idempotency_key: string;
	last_error: string | null;
	created_at: Date | string;
	completed_at: Date | string | null;
}

function iso(value: Date | string): string {
	return value instanceof Date
		? value.toISOString()
		: new Date(value).toISOString();
}

function mapTask(row: TaskRow): RecoveryTask {
	const payload =
		typeof row.payload === "string"
			? (JSON.parse(row.payload) as Record<string, unknown>)
			: row.payload;
	return {
		id: row.id,
		opportunityId: row.external_opportunity_id,
		recoverySessionId: row.recovery_session_id,
		taskType: row.task_type,
		payload,
		priority: row.priority,
		dueAt: iso(row.due_at),
		leasedAt: row.leased_at ? iso(row.leased_at) : undefined,
		leasedBy: row.leased_by ?? undefined,
		attempt: row.attempt,
		maxAttempts: row.max_attempts,
		lastError: row.last_error ?? undefined,
		createdAt: iso(row.created_at),
		completedAt: row.completed_at ? iso(row.completed_at) : undefined,
		status: row.status,
		idempotencyKey: row.idempotency_key,
	};
}

export class PostgresTaskQueue implements TaskQueue {
	constructor(
		private readonly sql: DatabaseClient,
		private readonly externalCrm = "hubspot",
	) {}

	async enqueue(task: RecoveryTask): Promise<RecoveryTask> {
		return await this.sql.begin(async (tx) => {
			const opportunities = await tx<{ id: string }[]>`
				INSERT INTO oplera.recovery_opportunities (
					external_crm,
					external_opportunity_id,
					recovery_status,
					recovery_score,
					amount,
					metadata
				)
				VALUES (
					${this.externalCrm},
					${task.opportunityId},
					'scheduled',
					0,
					0,
					'{}'::jsonb
				)
				ON CONFLICT (external_crm, external_opportunity_id)
				DO UPDATE SET external_opportunity_id = EXCLUDED.external_opportunity_id
				RETURNING id
			`;
			const opportunityId = opportunities[0]?.id;
			if (!opportunityId) throw new Error("recovery_opportunity_id_missing");
			const strategy =
				typeof task.payload.strategy === "string"
					? task.payload.strategy
					: null;

			await tx`
				INSERT INTO oplera.recovery_sessions (
					id,
					opportunity_id,
					status,
					strategy,
					attempt,
					max_attempts,
					started_at,
					updated_at
				)
				VALUES (
					${task.recoverySessionId},
					${opportunityId},
					'active',
					${strategy},
					${task.attempt},
					${task.maxAttempts},
					${task.createdAt},
					now()
				)
				ON CONFLICT (id) DO NOTHING
			`;

			const inserted = await tx<{ id: string }[]>`
				INSERT INTO oplera.recovery_tasks (
					id,
					opportunity_id,
					recovery_session_id,
					task_type,
					payload,
					priority,
					due_at,
					status,
					leased_at,
					leased_by,
					attempt,
					max_attempts,
					idempotency_key,
					last_error,
					created_at,
					completed_at,
					updated_at
				)
				VALUES (
					${task.id},
					${opportunityId},
					${task.recoverySessionId},
					${task.taskType},
					${JSON.stringify(task.payload)}::jsonb,
					${task.priority},
					${task.dueAt},
					${task.status},
					${task.leasedAt ?? null},
					${task.leasedBy ?? null},
					${task.attempt},
					${task.maxAttempts},
					${task.idempotencyKey},
					${task.lastError ?? null},
					${task.createdAt},
					${task.completedAt ?? null},
					now()
				)
				ON CONFLICT (idempotency_key) DO NOTHING
				RETURNING id
			`;
			if (inserted.length > 0) return structuredClone(task);

			const existing = await tx<TaskRow[]>`
				SELECT
					t.id,
					o.external_opportunity_id,
					t.recovery_session_id,
					t.task_type,
					t.payload,
					t.priority,
					t.due_at,
					t.status,
					t.leased_at,
					t.leased_by,
					t.attempt,
					t.max_attempts,
					t.idempotency_key,
					t.last_error,
					t.created_at,
					t.completed_at
				FROM oplera.recovery_tasks t
				JOIN oplera.recovery_opportunities o ON o.id = t.opportunity_id
				WHERE t.idempotency_key = ${task.idempotencyKey}
			`;
			const row = existing[0];
			if (!row) throw new Error("task_idempotency_conflict_missing");
			return mapTask(row);
		});
	}

	async list(): Promise<RecoveryTask[]> {
		const rows = await this.sql<TaskRow[]>`
			SELECT
				t.id,
				o.external_opportunity_id,
				t.recovery_session_id,
				t.task_type,
				t.payload,
				t.priority,
				t.due_at,
				t.status,
				t.leased_at,
				t.leased_by,
				t.attempt,
				t.max_attempts,
				t.idempotency_key,
				t.last_error,
				t.created_at,
				t.completed_at
			FROM oplera.recovery_tasks t
			JOIN oplera.recovery_opportunities o ON o.id = t.opportunity_id
			ORDER BY t.created_at ASC, t.id ASC
		`;
		return rows.map(mapTask);
	}

	async claimDue(
		workerId: string,
		nowIso: string,
		limit = 10,
		leaseMs = 60_000,
	): Promise<RecoveryTask[]> {
		const now = Date.parse(nowIso);
		if (Number.isNaN(now)) throw new Error("nowIso must be a valid ISO date");
		if (!Number.isInteger(limit) || limit < 1 || limit > 100)
			throw new Error("limit must be between 1 and 100");
		if (!Number.isFinite(leaseMs) || leaseMs < 1)
			throw new Error("leaseMs must be positive");
		const leaseExpiredBefore = new Date(now - leaseMs).toISOString();

		return await this.sql.begin(async (tx) => {
			await tx`
				UPDATE oplera.recovery_tasks
				SET
					status = 'failed',
					last_error = COALESCE(last_error, 'lease_expired_after_max_attempts'),
					completed_at = ${nowIso},
					updated_at = ${nowIso}
				WHERE status IN ('leased', 'running')
					AND leased_at <= ${leaseExpiredBefore}
					AND attempt >= max_attempts
			`;

			const rows = await tx<TaskRow[]>`
				WITH eligible AS (
					SELECT id
					FROM oplera.recovery_tasks
					WHERE due_at <= ${nowIso}
						AND attempt < max_attempts
						AND (
							status = 'pending'
							OR (
								status IN ('leased', 'running')
								AND leased_at IS NOT NULL
								AND leased_at <= ${leaseExpiredBefore}
							)
						)
					ORDER BY priority DESC, due_at ASC, id ASC
					FOR UPDATE SKIP LOCKED
					LIMIT ${limit}
				), leased AS (
					UPDATE oplera.recovery_tasks t
					SET
						status = 'leased',
						leased_at = ${nowIso},
						leased_by = ${workerId},
						attempt = t.attempt + 1,
						updated_at = ${nowIso}
					FROM eligible e
					WHERE t.id = e.id
					RETURNING t.*
				)
				SELECT
					leased.id,
					o.external_opportunity_id,
					leased.recovery_session_id,
					leased.task_type,
					leased.payload,
					leased.priority,
					leased.due_at,
					leased.status,
					leased.leased_at,
					leased.leased_by,
					leased.attempt,
					leased.max_attempts,
					leased.idempotency_key,
					leased.last_error,
					leased.created_at,
					leased.completed_at
				FROM leased
				JOIN oplera.recovery_opportunities o ON o.id = leased.opportunity_id
				ORDER BY leased.priority DESC, leased.due_at ASC, leased.id ASC
			`;
			return rows.map(mapTask);
		});
	}

	async markRunning(taskId: string, workerId: string): Promise<RecoveryTask> {
		return await this.updateOwned(taskId, workerId, "leased", async () => {
			return await this.sql<TaskRow[]>`
				WITH updated AS (
					UPDATE oplera.recovery_tasks
					SET status = 'running', updated_at = now()
					WHERE id = ${taskId} AND status = 'leased' AND leased_by = ${workerId}
					RETURNING *
				)
				SELECT updated.*, o.external_opportunity_id
				FROM updated
				JOIN oplera.recovery_opportunities o ON o.id = updated.opportunity_id
			`;
		});
	}

	async succeed(
		taskId: string,
		workerId: string,
		completedAt: string,
	): Promise<RecoveryTask> {
		return await this.updateOwned(taskId, workerId, "owned", async () => {
			return await this.sql<TaskRow[]>`
				WITH updated AS (
					UPDATE oplera.recovery_tasks
					SET status = 'succeeded', completed_at = ${completedAt}, updated_at = ${completedAt}
					WHERE id = ${taskId}
						AND status IN ('leased', 'running')
						AND leased_by = ${workerId}
					RETURNING *
				)
				SELECT updated.*, o.external_opportunity_id
				FROM updated
				JOIN oplera.recovery_opportunities o ON o.id = updated.opportunity_id
			`;
		});
	}

	async fail(
		taskId: string,
		workerId: string,
		nowIso: string,
		error: string,
		retryDelayMs = 60_000,
	): Promise<RecoveryTask> {
		const retryAt = new Date(Date.parse(nowIso) + retryDelayMs).toISOString();
		return await this.updateOwned(taskId, workerId, "owned", async () => {
			return await this.sql<TaskRow[]>`
				WITH updated AS (
					UPDATE oplera.recovery_tasks
					SET
						last_error = ${error.slice(0, 1_000)},
						leased_at = NULL,
						leased_by = NULL,
						status = CASE WHEN attempt >= max_attempts THEN 'failed' ELSE 'pending' END,
						completed_at = CASE WHEN attempt >= max_attempts THEN ${nowIso}::timestamptz ELSE NULL END,
						due_at = CASE WHEN attempt >= max_attempts THEN due_at ELSE ${retryAt}::timestamptz END,
						updated_at = ${nowIso}
					WHERE id = ${taskId}
						AND status IN ('leased', 'running')
						AND leased_by = ${workerId}
					RETURNING *
				)
				SELECT updated.*, o.external_opportunity_id
				FROM updated
				JOIN oplera.recovery_opportunities o ON o.id = updated.opportunity_id
			`;
		});
	}

	async cancel(taskId: string, completedAt: string): Promise<RecoveryTask> {
		const rows = await this.sql<TaskRow[]>`
			WITH updated AS (
				UPDATE oplera.recovery_tasks
				SET status = 'cancelled', completed_at = ${completedAt}, updated_at = ${completedAt}
				WHERE id = ${taskId}
				RETURNING *
			)
			SELECT updated.*, o.external_opportunity_id
			FROM updated
			JOIN oplera.recovery_opportunities o ON o.id = updated.opportunity_id
		`;
		const row = rows[0];
		if (!row) throw new Error(`unknown task ${taskId}`);
		return mapTask(row);
	}

	private async updateOwned(
		taskId: string,
		workerId: string,
		mode: "leased" | "owned",
		update: () => Promise<TaskRow[]>,
	): Promise<RecoveryTask> {
		const rows = await update();
		const row = rows[0];
		if (!row) {
			const task = await this.sql<{ status: string; leased_by: string | null }[]>`
				SELECT status, leased_by FROM oplera.recovery_tasks WHERE id = ${taskId}
			`;
			if (task.length === 0) throw new Error(`unknown task ${taskId}`);
			throw new Error(
				mode === "leased"
					? "task is not leased by this worker"
					: "task is not owned by this worker",
			);
		}
		return mapTask(row);
	}
}
