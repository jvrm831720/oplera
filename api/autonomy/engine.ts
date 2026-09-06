import {
	type ConversationDecision,
	decideConversationReply,
} from "./conversation-agent.ts";
import {
	NullRecoveryPersistence,
	type RecoveryPersistence,
} from "./persistence.ts";
import { planRecovery } from "./planner.ts";
import { evaluateRecoveryPolicy } from "./policy-engine.ts";
import type { CRMProvider, MessagingProvider } from "./providers.ts";
import type { TaskQueue } from "./task-queue.ts";
import type {
	PolicyDecision,
	RecoveryCandidate,
	RecoveryEvent,
	RecoveryHandoff,
	RecoveryPolicy,
	RecoveryTask,
} from "./types.ts";

export interface DispatchResult {
	claimed: number;
	executed: number;
	blocked: number;
	requiresApproval: number;
	events: RecoveryEvent[];
}

function firstName(name: string): string {
	return name.trim().split(/\s+/)[0] ?? name;
}

export function draftRecoveryMessage(candidate: RecoveryCandidate): string {
	const name = firstName(candidate.contactName);
	switch (candidate.reasonCode) {
		case "proposal_ghosted":
			return `Oi, ${name}. Estou retomando a proposta que já estava registrada na nossa conversa. Ainda faz sentido avançarmos ou existe algum ponto que ficou pendente?`;
		case "lost_timing":
			return `Oi, ${name}. Quando falamos antes, o momento não era o ideal. Queria confirmar se esse projeto voltou a ser prioridade ou se ainda faz sentido deixar para mais adiante.`;
		case "seller_dropped":
			return `Oi, ${name}. Nossa conversa ficou sem continuidade do nosso lado. Estou retomando do ponto em que você parou para não deixar sua solicitação perdida. Ainda faz sentido seguir?`;
		case "budget_objection":
			return `Oi, ${name}. Na última conversa ficou registrado que orçamento era um ponto importante. Isso continua sendo o principal bloqueio para avançarmos?`;
		case "high_intent_abandoned":
			return `Oi, ${name}. Vi que havia interesse na conversa anterior, mas ela ficou sem um próximo passo claro. Ainda faz sentido retomarmos de onde paramos?`;
		case "stale_low_intent":
			return `Oi, ${name}. Estou revisando uma conversa antiga que ficou sem conclusão. Esse assunto ainda é relevante para você?`;
	}
}

function event(input: Omit<RecoveryEvent, "id">): RecoveryEvent {
	return { id: crypto.randomUUID(), ...input };
}

function temporaryPolicyBlock(decision: PolicyDecision): boolean {
	return decision.reasons.some((reason) =>
		["blocked_by_hours", "blocked_by_weekday", "minimum_interval"].includes(
			reason,
		),
	);
}

export class AutonomousRecoveryEngine {
	readonly events: RecoveryEvent[] = [];
	readonly handoffs: RecoveryHandoff[] = [];

	constructor(
		private readonly crm: CRMProvider,
		private readonly messaging: MessagingProvider,
		readonly queue: TaskQueue,
		readonly policy: RecoveryPolicy,
		private readonly persistence: RecoveryPersistence = new NullRecoveryPersistence(),
	) {}

	private async recordEvent(recoveryEvent: RecoveryEvent): Promise<void> {
		this.events.push(recoveryEvent);
		await this.persistence.appendEvent(recoveryEvent);
	}

	async discover(): Promise<RecoveryCandidate[]> {
		const candidates = await this.crm.listRecoveryCandidates();
		for (const candidate of candidates) {
			await this.persistence.upsertOpportunity(candidate);
			await this.recordEvent(
				event({
					timestamp: new Date().toISOString(),
					opportunityId: candidate.id,
					actor: "agent",
					action: "candidate_discovered",
					inputSummary: "CRM candidate normalized",
					decision: candidate.optedOut ? "suppressed" : "analyze",
					result: candidate.reasonSummary,
				}),
			);
		}
		return candidates;
	}

	async schedule(
		candidateId: string,
		now: string,
	): Promise<RecoveryTask | null> {
		const candidate = await this.crm.getOpportunityContext(candidateId);
		if (!candidate || candidate.optedOut || candidate.activeHumanConversation)
			return null;
		if (
			["suppressed", "recovered", "lost", "handed_off"].includes(
				candidate.status,
			)
		)
			return null;

		const plan = planRecovery(candidate, this.policy.contact.maxAttempts);
		const task: RecoveryTask = {
			id: `task-${candidate.id}-${candidate.attempt + 1}`,
			opportunityId: candidate.id,
			recoverySessionId: `session-${candidate.id}`,
			taskType:
				plan.firstAction.type === "send_message" ? "send_message" : "handoff",
			payload: { strategy: plan.strategy, objective: plan.objective },
			priority: candidate.recoveryScore * 10,
			dueAt: candidate.dueAt ?? now,
			attempt: candidate.attempt,
			maxAttempts: plan.maxAttempts,
			createdAt: now,
			status: "pending",
			idempotencyKey: `${candidate.id}:${plan.strategy}:${candidate.attempt + 1}`,
		};
		await this.persistence.upsertOpportunity(candidate);
		await this.persistence.upsertSession({
			id: task.recoverySessionId,
			opportunityId: candidate.id,
			status: "active",
			strategy: plan.strategy,
			channel: candidate.channel,
			attempt: candidate.attempt,
			maxAttempts: plan.maxAttempts,
			startedAt: now,
		});
		return await this.queue.enqueue(task);
	}

	async dispatchDue(workerId: string, now: string): Promise<DispatchResult> {
		const claimed = await this.queue.claimDue(workerId, now, 20);
		let executed = 0;
		let blocked = 0;
		let requiresApproval = 0;

		for (const leasedTask of claimed) {
			await this.queue.markRunning(leasedTask.id, workerId);
			const candidate = await this.crm.getOpportunityContext(
				leasedTask.opportunityId,
			);
			if (!candidate) {
				await this.queue.fail(
					leasedTask.id,
					workerId,
					now,
					"opportunity_not_found",
				);
				continue;
			}
			await this.persistence.upsertOpportunity(candidate);

			if (leasedTask.taskType !== "send_message") {
				await this.queue.succeed(leasedTask.id, workerId, now);
				executed += 1;
				continue;
			}

			const decision = evaluateRecoveryPolicy({
				policy: this.policy,
				action: "send_message",
				channel: candidate.channel,
				now,
				conversation: candidate.conversation,
				attempt: candidate.attempt,
				optedOut: candidate.optedOut,
				activeHumanConversation: candidate.activeHumanConversation,
				opportunityStatus: candidate.status,
				suppressed: candidate.status === "suppressed",
				messageMode: "free_form",
				providerSupportsApprovedTemplate: false,
			});
			await this.persistence.appendDecision({
				opportunityId: candidate.id,
				recoverySessionId: leasedTask.recoverySessionId,
				decisionType: "policy",
				decision: decision.result,
				evidence: decision.reasons,
				shortReason: decision.reasons.join(", ") || decision.result,
				createdAt: now,
			});

			await this.recordEvent(
				event({
					timestamp: now,
					opportunityId: candidate.id,
					taskId: leasedTask.id,
					actor: "policy",
					action: "policy_checked",
					inputSummary: `send_message via ${candidate.channel}`,
					decision: decision.reasons.join(", "),
					policyResult: decision.result,
					toolInvoked:
						candidate.channel === "whatsapp"
							? "resolveServiceWindow"
							: undefined,
					result: decision.result,
				}),
			);

			if (decision.result === "blocked") {
				blocked += 1;
				if (temporaryPolicyBlock(decision)) {
					await this.queue.fail(
						leasedTask.id,
						workerId,
						now,
						decision.reasons.join(","),
						3_600_000,
					);
				} else {
					await this.queue.cancel(leasedTask.id, now);
					await this.crm.updateOpportunity(candidate.id, "suppressed");
				}
				continue;
			}

			if (decision.result === "requires_approval") {
				requiresApproval += 1;
				await this.queue.cancel(leasedTask.id, now);
				await this.crm.updateOpportunity(candidate.id, "human_review");
				continue;
			}

			const text = draftRecoveryMessage(candidate);
			const sendResult = await this.messaging.sendMessage({
				idempotencyKey: leasedTask.idempotencyKey,
				opportunityId: candidate.id,
				channel: candidate.channel,
				text,
				mode: "free_form",
			});
			await this.crm.appendConversationMessage(candidate.id, {
				direction: "outbound",
				text,
				timestamp: now,
			});
			await this.persistence.appendMessage(
				{
					id: crypto.randomUUID(),
					opportunityId: candidate.id,
					actor: "oplera",
					channel: candidate.channel,
					text,
					timestamp: now,
				},
				leasedTask.recoverySessionId,
				sendResult.providerMessageId,
			);
			await this.crm.recordContactAttempt(candidate.id);
			await this.crm.createActivity(
				candidate.id,
				`Recovery outreach accepted: ${sendResult.providerMessageId}`,
			);
			await this.crm.updateOpportunity(candidate.id, "awaiting_reply");
			await this.queue.succeed(leasedTask.id, workerId, now);
			executed += 1;
			await this.recordEvent(
				event({
					timestamp: now,
					opportunityId: candidate.id,
					taskId: leasedTask.id,
					actor: "provider",
					action: "recovery_message_sent",
					inputSummary: "Policy-approved recovery message",
					decision: "execute",
					policyResult: "allowed",
					toolInvoked: "send_recovery_message",
					result: sendResult.providerMessageId,
				}),
			);
		}

		return {
			claimed: claimed.length,
			executed,
			blocked,
			requiresApproval,
			events: [...this.events],
		};
	}

	async observeReply(
		candidateId: string,
		text: string,
		timestamp: string,
	): Promise<ConversationDecision> {
		const candidate = await this.crm.getOpportunityContext(candidateId);
		if (!candidate) throw new Error("opportunity_not_found");
		await this.persistence.upsertOpportunity(candidate);
		const decision = decideConversationReply(candidate, text, this.policy);
		await this.crm.appendConversationMessage(candidate.id, {
			direction: "inbound",
			text,
			timestamp,
		});
		await this.persistence.appendMessage(
			{
				id: crypto.randomUUID(),
				opportunityId: candidate.id,
				actor: "customer",
				channel: candidate.channel,
				text,
				timestamp,
			},
			`session-${candidate.id}`,
		);
		await this.persistence.appendDecision({
			opportunityId: candidate.id,
			recoverySessionId: `session-${candidate.id}`,
			decisionType: "conversation",
			decision: `${decision.intent}:${decision.state}`,
			evidence: {
				objection: decision.objection,
				should_handoff: decision.shouldHandoff,
			},
			shortReason: decision.recommendedAction,
			createdAt: timestamp,
		});

		if (decision.intent === "opt_out") {
			await this.crm.updateOpportunity(candidate.id, "suppressed");
		} else if (decision.shouldHandoff) {
			await this.crm.updateOpportunity(candidate.id, "human_review");
			const handoff: RecoveryHandoff = {
				id: crypto.randomUUID(),
				opportunityId: candidate.id,
				reason: decision.handoffReason ?? "human_review",
				summary: `Reply classified as ${decision.intent}; autonomous continuation stopped.`,
				context: candidate.evidence,
				lastMessage: text,
				recommendedAction: decision.recommendedAction,
				createdAt: timestamp,
			};
			this.handoffs.push(handoff);
			await this.persistence.appendHandoff(handoff, `session-${candidate.id}`);
		} else if (decision.intent === "not_interested") {
			await this.crm.updateOpportunity(candidate.id, "lost");
		} else {
			await this.crm.updateOpportunity(candidate.id, "engaged");
		}

		await this.recordEvent(
			event({
				timestamp,
				opportunityId: candidate.id,
				actor: "agent",
				action: "reply_observed",
				inputSummary: text.slice(0, 180),
				decision: `${decision.intent}:${decision.state}`,
				toolInvoked: decision.shouldHandoff
					? "request_human_handoff"
					: "update_recovery_status",
				result: decision.recommendedAction,
			}),
		);
		return decision;
	}
}
