import type { DatabaseClient } from "../db/client.ts";
import type {
	RecoveryCandidate,
	RecoveryEvent,
	RecoveryHandoff,
	RecoveryMessage,
} from "./types.ts";
import type {
	RecoveryDecisionRecord,
	RecoveryPersistence,
	RecoverySessionRecord,
} from "./persistence.ts";

interface OpportunityIdRow {
	id: string;
}

export class PostgresRecoveryPersistence implements RecoveryPersistence {
	constructor(
		private readonly sql: DatabaseClient,
		private readonly externalCrm = "hubspot",
	) {}

	private async opportunityId(externalOpportunityId: string): Promise<string> {
		const rows = await this.sql<OpportunityIdRow[]>`
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
				${externalOpportunityId},
				'discovered',
				0,
				0,
				'{}'::jsonb
			)
			ON CONFLICT (external_crm, external_opportunity_id)
			DO UPDATE SET external_opportunity_id = EXCLUDED.external_opportunity_id
			RETURNING id
		`;
		const id = rows[0]?.id;
		if (!id) throw new Error("recovery_opportunity_id_missing");
		return id;
	}

	private async existingSessionId(value?: string): Promise<string | null> {
		if (!value) return null;
		const rows = await this.sql<{ id: string }[]>`
			SELECT id FROM oplera.recovery_sessions WHERE id = ${value}
		`;
		return rows[0]?.id ?? null;
	}

	async upsertOpportunity(candidate: RecoveryCandidate): Promise<void> {
		const metadata = JSON.stringify({
			attempt: candidate.attempt,
			channel: candidate.channel,
			assignee: candidate.assignee,
			next_action: candidate.nextAction,
			opted_out: candidate.optedOut,
			active_human_conversation: candidate.activeHumanConversation,
		});
		await this.sql`
			INSERT INTO oplera.recovery_opportunities (
				external_crm,
				external_opportunity_id,
				recovery_status,
				recovery_score,
				amount,
				reason_code,
				last_activity_at,
				metadata,
				updated_at
			)
			VALUES (
				${this.externalCrm},
				${candidate.crmId},
				${candidate.status},
				${candidate.recoveryScore},
				${candidate.amount},
				${candidate.reasonCode},
				${candidate.lastActivity},
				${metadata}::jsonb,
				now()
			)
			ON CONFLICT (external_crm, external_opportunity_id)
			DO UPDATE SET
				recovery_status = EXCLUDED.recovery_status,
				recovery_score = EXCLUDED.recovery_score,
				amount = EXCLUDED.amount,
				reason_code = EXCLUDED.reason_code,
				last_activity_at = EXCLUDED.last_activity_at,
				metadata = EXCLUDED.metadata,
				updated_at = now()
		`;
	}

	async upsertSession(session: RecoverySessionRecord): Promise<void> {
		const opportunityId = await this.opportunityId(session.opportunityId);
		await this.sql`
			INSERT INTO oplera.recovery_sessions (
				id,
				opportunity_id,
				status,
				strategy,
				channel,
				attempt,
				max_attempts,
				started_at,
				completed_at,
				updated_at
			)
			VALUES (
				${session.id},
				${opportunityId},
				${session.status},
				${session.strategy},
				${session.channel},
				${session.attempt},
				${session.maxAttempts},
				${session.startedAt},
				${session.completedAt ?? null},
				now()
			)
			ON CONFLICT (id)
			DO UPDATE SET
				status = EXCLUDED.status,
				strategy = EXCLUDED.strategy,
				channel = EXCLUDED.channel,
				attempt = EXCLUDED.attempt,
				max_attempts = EXCLUDED.max_attempts,
				completed_at = EXCLUDED.completed_at,
				updated_at = now()
		`;
	}

	async appendMessage(
		message: RecoveryMessage,
		recoverySessionId?: string,
		externalMessageId?: string,
	): Promise<void> {
		const opportunityId = await this.opportunityId(message.opportunityId);
		const sessionId = await this.existingSessionId(recoverySessionId);
		const direction = message.actor === "customer" ? "inbound" : "outbound";
		await this.sql`
			INSERT INTO oplera.recovery_messages (
				id,
				opportunity_id,
				recovery_session_id,
				external_message_id,
				direction,
				actor,
				channel,
				content,
				received_or_sent_at
			)
			VALUES (
				${message.id},
				${opportunityId},
				${sessionId},
				${externalMessageId ?? null},
				${direction},
				${message.actor},
				${message.channel},
				${message.text},
				${message.timestamp}
			)
			ON CONFLICT (id) DO NOTHING
		`;
	}

	async appendDecision(decision: RecoveryDecisionRecord): Promise<void> {
		const opportunityId = await this.opportunityId(decision.opportunityId);
		const sessionId = await this.existingSessionId(decision.recoverySessionId);
		await this.sql`
			INSERT INTO oplera.recovery_decisions (
				opportunity_id,
				recovery_session_id,
				decision_type,
				decision,
				evidence,
				short_reason,
				model,
				provider,
				created_at
			)
			VALUES (
				${opportunityId},
				${sessionId},
				${decision.decisionType},
				${decision.decision},
				${JSON.stringify(decision.evidence)}::jsonb,
				${decision.shortReason},
				${decision.model ?? null},
				${decision.provider ?? null},
				${decision.createdAt}
			)
		`;
	}

	async appendEvent(event: RecoveryEvent): Promise<void> {
		const opportunityId = event.opportunityId
			? await this.opportunityId(event.opportunityId)
			: null;
		let taskId: string | null = null;
		let sessionId: string | null = null;
		if (event.taskId) {
			const tasks = await this.sql<{ id: string; recovery_session_id: string }[]>`
				SELECT id, recovery_session_id
				FROM oplera.recovery_tasks
				WHERE id = ${event.taskId}
			`;
			taskId = tasks[0]?.id ?? null;
			sessionId = tasks[0]?.recovery_session_id ?? null;
		}
		await this.sql`
			INSERT INTO oplera.recovery_events (
				id,
				opportunity_id,
				recovery_session_id,
				task_id,
				actor,
				event_type,
				action,
				decision,
				policy_result,
				result,
				error,
				metadata,
				created_at
			)
			VALUES (
				${event.id},
				${opportunityId},
				${sessionId},
				${taskId},
				${event.actor},
				${event.action},
				${event.action},
				${event.decision},
				${event.policyResult ?? null},
				${event.result},
				${event.error ?? null},
				${JSON.stringify({ input_summary: event.inputSummary, tool_invoked: event.toolInvoked ?? null })}::jsonb,
				${event.timestamp}
			)
		`;
	}

	async appendHandoff(
		handoff: RecoveryHandoff,
		recoverySessionId?: string,
	): Promise<void> {
		const opportunityId = await this.opportunityId(handoff.opportunityId);
		const sessionId = await this.existingSessionId(recoverySessionId);
		await this.sql`
			INSERT INTO oplera.recovery_handoffs (
				id,
				opportunity_id,
				recovery_session_id,
				reason,
				summary,
				context,
				recommended_action,
				status,
				created_at
			)
			VALUES (
				${handoff.id},
				${opportunityId},
				${sessionId},
				${handoff.reason},
				${handoff.summary},
				${JSON.stringify(handoff.context)}::jsonb,
				${handoff.recommendedAction},
				'open',
				${handoff.createdAt}
			)
			ON CONFLICT (id) DO NOTHING
		`;
	}
}
