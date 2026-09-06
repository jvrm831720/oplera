import type { DatabaseClient } from "../db/client.ts";

export interface InternalRecoveryMessage {
	id: string;
	direction: "inbound" | "outbound";
	actor: string;
	channel: string;
	content: string;
	timestamp: string;
	externalMessageId: string | null;
}

export interface InternalRecoveryDecision {
	decisionType: string;
	decision: string;
	evidence: unknown;
	shortReason: string;
	createdAt: string;
}

export interface InternalRecoveryTask {
	id: string;
	taskType: string;
	status: string;
	dueAt: string;
	priority: number;
	payload: unknown;
}

export interface InternalRecoveryHandoff {
	reason: string;
	summary: string;
	context: unknown;
	recommendedAction: string;
	status: string;
	createdAt: string;
}

export interface InternalRecoveryEvent {
	id: string;
	actor: string;
	action: string;
	decision: string;
	policyResult: string | null;
	result: string;
	createdAt: string;
}

export interface InternalRevenueContext {
	session: {
		id: string;
		status: string;
		strategy: string | null;
		attempt: number;
		maxAttempts: number;
		startedAt: string;
		completedAt: string | null;
	} | null;
	nextTask: InternalRecoveryTask | null;
	messages: InternalRecoveryMessage[];
	latestDecision: InternalRecoveryDecision | null;
	events: InternalRecoveryEvent[];
	handoff: InternalRecoveryHandoff | null;
	pilotApproval: {
		approvedAt: string;
		approvedBy: string;
		consumedAt: string | null;
	} | null;
	pilotOutbound: Array<{
		providerMessageId: string | null;
		status: string;
		createdAt: string;
	}>;
	pilotInbound: Array<{
		externalMessageId: string;
		processedAt: string;
	}>;
	freshnessAt: string | null;
}

export interface InternalRevenueContextReader {
	read(externalOpportunityId: string): Promise<InternalRevenueContext>;
}

function emptyContext(): InternalRevenueContext {
	return {
		session: null,
		nextTask: null,
		messages: [],
		latestDecision: null,
		events: [],
		handoff: null,
		pilotApproval: null,
		pilotOutbound: [],
		pilotInbound: [],
		freshnessAt: null,
	};
}

function iso(value: string | Date | null | undefined): string | null {
	if (!value) return null;
	const date = value instanceof Date ? value : new Date(value);
	return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export class NullInternalRevenueContextReader
	implements InternalRevenueContextReader
{
	async read(_externalOpportunityId: string): Promise<InternalRevenueContext> {
		return emptyContext();
	}
}

export class PostgresInternalRevenueContextReader
	implements InternalRevenueContextReader
{
	constructor(private readonly sql: DatabaseClient) {}

	async read(externalOpportunityId: string): Promise<InternalRevenueContext> {
		const opportunities = await this.sql<
			Array<{ id: string; updated_at: string | Date }>
		>`
			SELECT id, updated_at
			FROM oplera.recovery_opportunities
			WHERE external_crm = 'hubspot'
				AND external_opportunity_id = ${externalOpportunityId}
			LIMIT 1
		`;
		const opportunity = opportunities[0];
		if (!opportunity) return emptyContext();

		const opportunityId = opportunity.id;
		const [
			sessions,
			tasks,
			messages,
			decisions,
			events,
			handoffs,
			approvals,
			outbound,
			inbound,
		] = await Promise.all([
			this.sql<
				Array<{
					id: string;
					status: string;
					strategy: string | null;
					attempt: number;
					max_attempts: number;
					started_at: string | Date;
					completed_at: string | Date | null;
				}>
			>`
					SELECT id, status, strategy, attempt, max_attempts, started_at, completed_at
					FROM oplera.recovery_sessions
					WHERE opportunity_id = ${opportunityId}
					ORDER BY started_at DESC
					LIMIT 1
				`,
			this.sql<
				Array<{
					id: string;
					task_type: string;
					status: string;
					due_at: string | Date;
					priority: number;
					payload: unknown;
				}>
			>`
					SELECT id, task_type, status, due_at, priority, payload
					FROM oplera.recovery_tasks
					WHERE opportunity_id = ${opportunityId}
						AND status IN ('pending', 'leased', 'running')
					ORDER BY due_at ASC, priority DESC, id ASC
					LIMIT 1
				`,
			this.sql<
				Array<{
					id: string;
					direction: "inbound" | "outbound";
					actor: string;
					channel: string;
					content: string;
					received_or_sent_at: string | Date;
					external_message_id: string | null;
				}>
			>`
					SELECT id, direction, actor, channel, content, received_or_sent_at, external_message_id
					FROM oplera.recovery_messages
					WHERE opportunity_id = ${opportunityId}
					ORDER BY received_or_sent_at DESC
					LIMIT 30
				`,
			this.sql<
				Array<{
					decision_type: string;
					decision: string;
					evidence: unknown;
					short_reason: string;
					created_at: string | Date;
				}>
			>`
					SELECT decision_type, decision, evidence, short_reason, created_at
					FROM oplera.recovery_decisions
					WHERE opportunity_id = ${opportunityId}
					ORDER BY created_at DESC
					LIMIT 1
				`,
			this.sql<
				Array<{
					id: string;
					actor: string;
					action: string;
					decision: string;
					policy_result: string | null;
					result: string;
					created_at: string | Date;
				}>
			>`
					SELECT id, actor, action, decision, policy_result, result, created_at
					FROM oplera.recovery_events
					WHERE opportunity_id = ${opportunityId}
					ORDER BY created_at DESC
					LIMIT 20
				`,
			this.sql<
				Array<{
					reason: string;
					summary: string;
					context: unknown;
					recommended_action: string;
					status: string;
					created_at: string | Date;
				}>
			>`
					SELECT reason, summary, context, recommended_action, status, created_at
					FROM oplera.recovery_handoffs
					WHERE opportunity_id = ${opportunityId}
						AND status = 'open'
					ORDER BY created_at DESC
					LIMIT 1
				`,
			this.sql<
				Array<{
					approved_at: string | Date;
					approved_by: string;
					consumed_at: string | Date | null;
				}>
			>`
					SELECT approved_at, approved_by, consumed_at
					FROM oplera.pilot_approvals
					WHERE opportunity_id = ${externalOpportunityId}
					ORDER BY approved_at DESC
					LIMIT 1
				`,
			this.sql<
				Array<{
					provider_message_id: string | null;
					status: string;
					created_at: string | Date;
				}>
			>`
					SELECT provider_message_id, status, created_at
					FROM oplera.pilot_outbound_operations
					WHERE opportunity_id = ${externalOpportunityId}
					ORDER BY created_at DESC
					LIMIT 10
				`,
			this.sql<
				Array<{
					external_message_id: string;
					processed_at: string | Date;
				}>
			>`
					SELECT external_message_id, processed_at
					FROM oplera.pilot_inbound_messages
					WHERE opportunity_id = ${externalOpportunityId}
					ORDER BY processed_at DESC
					LIMIT 10
				`,
		]);

		const session = sessions[0];
		const task = tasks[0];
		const decision = decisions[0];
		const handoff = handoffs[0];
		const approval = approvals[0];

		const normalizedMessages = messages
			.map((item) => ({
				id: item.id,
				direction: item.direction,
				actor: item.actor,
				channel: item.channel,
				content: item.content,
				timestamp: iso(item.received_or_sent_at) ?? new Date(0).toISOString(),
				externalMessageId: item.external_message_id,
			}))
			.sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));

		const timestamps = [
			iso(opportunity.updated_at),
			...normalizedMessages.map((item) => item.timestamp),
			...events.map((item) => iso(item.created_at)),
			...outbound.map((item) => iso(item.created_at)),
			...inbound.map((item) => iso(item.processed_at)),
		].filter((value): value is string => Boolean(value));
		const freshnessAt =
			timestamps.sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? null;

		return {
			session: session
				? {
						id: session.id,
						status: session.status,
						strategy: session.strategy,
						attempt: session.attempt,
						maxAttempts: session.max_attempts,
						startedAt: iso(session.started_at) ?? new Date(0).toISOString(),
						completedAt: iso(session.completed_at),
					}
				: null,
			nextTask: task
				? {
						id: task.id,
						taskType: task.task_type,
						status: task.status,
						dueAt: iso(task.due_at) ?? new Date(0).toISOString(),
						priority: task.priority,
						payload: task.payload,
					}
				: null,
			messages: normalizedMessages,
			latestDecision: decision
				? {
						decisionType: decision.decision_type,
						decision: decision.decision,
						evidence: decision.evidence,
						shortReason: decision.short_reason,
						createdAt: iso(decision.created_at) ?? new Date(0).toISOString(),
					}
				: null,
			events: events.map((item) => ({
				id: item.id,
				actor: item.actor,
				action: item.action,
				decision: item.decision,
				policyResult: item.policy_result,
				result: item.result,
				createdAt: iso(item.created_at) ?? new Date(0).toISOString(),
			})),
			handoff: handoff
				? {
						reason: handoff.reason,
						summary: handoff.summary,
						context: handoff.context,
						recommendedAction: handoff.recommended_action,
						status: handoff.status,
						createdAt: iso(handoff.created_at) ?? new Date(0).toISOString(),
					}
				: null,
			pilotApproval: approval
				? {
						approvedAt: iso(approval.approved_at) ?? new Date(0).toISOString(),
						approvedBy: approval.approved_by,
						consumedAt: iso(approval.consumed_at),
					}
				: null,
			pilotOutbound: outbound.map((item) => ({
				providerMessageId: item.provider_message_id,
				status: item.status,
				createdAt: iso(item.created_at) ?? new Date(0).toISOString(),
			})),
			pilotInbound: inbound.map((item) => ({
				externalMessageId: item.external_message_id,
				processedAt: iso(item.processed_at) ?? new Date(0).toISOString(),
			})),
			freshnessAt,
		};
	}
}
