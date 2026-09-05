import { buildDemoOperatorConsole, demoCandidates } from "./demo.ts";
import { AutonomousRecoveryEngine } from "./engine.ts";
import { evaluateRecoveryPolicy, defaultRecoveryPolicy } from "./policy-engine.ts";
import { DemoCRMProvider, DemoMessagingProvider } from "./providers.ts";
import { MemoryTaskQueue } from "./task-queue.ts";
import type { OperatorConsoleSnapshot, RecoveryCandidate } from "./types.ts";

export type DemoAgentStep =
	| "discovery"
	| "analysis"
	| "planner"
	| "policy"
	| "outreach"
	| "incoming_reply"
	| "conversation"
	| "handoff"
	| "dispatch";

function messageRows(opportunities: RecoveryCandidate[]) {
	return opportunities.flatMap((opportunity) =>
		opportunity.conversation.map((message, index) => ({
			id: `${opportunity.id}-runtime-${index + 1}`,
			opportunityId: opportunity.id,
			actor: message.direction === "inbound" ? ("customer" as const) : ("oplera" as const),
			channel: opportunity.channel,
			text: message.text,
			timestamp: message.timestamp,
		})),
	);
}

export class DemoRecoveryRuntime {
	readonly crm: DemoCRMProvider;
	readonly messaging: DemoMessagingProvider;
	readonly queue: MemoryTaskQueue;
	readonly engine: AutonomousRecoveryEngine;

	constructor(reference = new Date()) {
		this.crm = new DemoCRMProvider(demoCandidates(reference));
		this.messaging = new DemoMessagingProvider();
		this.queue = new MemoryTaskQueue();
		this.engine = new AutonomousRecoveryEngine(
			this.crm,
			this.messaging,
			this.queue,
			defaultRecoveryPolicy,
		);
	}

	async ensureScheduled(now: string): Promise<void> {
		const candidates = await this.crm.listRecoveryCandidates();
		for (const candidate of candidates) {
			await this.engine.schedule(candidate.id, now);
		}
	}

	async dispatch(now: string) {
		await this.ensureScheduled(now);
		return this.engine.dispatchDue("demo-dispatcher", now);
	}

	async runStep(step: DemoAgentStep, now: string): Promise<unknown> {
		switch (step) {
			case "discovery":
				return this.engine.discover();
			case "analysis":
				return this.crm.listRecoveryCandidates();
			case "planner":
				await this.ensureScheduled(now);
				return this.queue.list();
			case "policy": {
				const candidates = await this.crm.listRecoveryCandidates();
				return candidates.map((candidate) => ({
					opportunity_id: candidate.id,
					decision: evaluateRecoveryPolicy({
						policy: defaultRecoveryPolicy,
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
					}),
				}));
			}
			case "outreach":
			case "dispatch":
				return this.dispatch(now);
			case "incoming_reply":
				return {
					message: "Use POST /api/v0.4/replies so the reply carries opportunity_id and text.",
				};
			case "conversation":
				return {
					events: this.engine.events.filter((item) => item.action === "reply_observed"),
				};
			case "handoff":
				return this.engine.handoffs;
		}
	}

	async snapshot(reference = new Date()): Promise<OperatorConsoleSnapshot> {
		const base = buildDemoOperatorConsole(reference);
		const opportunities = await this.crm.listRecoveryCandidates();
		const tasks = this.queue.list();
		const now = reference.getTime();
		const activeRecoverable = opportunities.filter(
			(item) => !["suppressed", "recovered", "lost"].includes(item.status),
		);
		const events = [...base.events, ...this.engine.events];
		const handoffs = [...base.handoffs, ...this.engine.handoffs];
		return {
			...base,
			generatedAt: reference.toISOString(),
			opportunities,
			tasks,
			messages: messageRows(opportunities),
			handoffs,
			events,
			queue: {
				dueNow: tasks.filter(
					(item) => item.status === "pending" && Date.parse(item.dueAt) <= now,
				).length,
				scheduled: tasks.filter(
					(item) => item.status === "pending" && Date.parse(item.dueAt) > now,
				).length,
				processing: tasks.filter(
					(item) => item.status === "leased" || item.status === "running",
				).length,
				awaitingReply: opportunities.filter((item) =>
					["awaiting_reply", "engaged"].includes(item.status),
				).length,
				humanReview: opportunities.filter((item) => item.status === "human_review")
					.length,
			},
			recovery: {
				opportunitiesAnalyzed: opportunities.length,
				recoverable: activeRecoverable.length,
				contacted: opportunities.filter((item) =>
					[
						"contacted",
						"awaiting_reply",
						"engaged",
						"human_review",
						"handed_off",
						"recovered",
					].includes(item.status),
				).length,
				engaged: opportunities.filter((item) => item.status === "engaged").length,
				handedOff: handoffs.length,
				recoveredWon: opportunities.filter((item) => item.status === "recovered").length,
				recoverableValue: activeRecoverable.reduce((sum, item) => sum + item.amount, 0),
				recoveredValue: opportunities
					.filter((item) => item.status === "recovered")
					.reduce((sum, item) => sum + item.amount, 0),
			},
		};
	}
}

const runtime = new DemoRecoveryRuntime();

export function getDemoRecoveryRuntime(): DemoRecoveryRuntime {
	return runtime;
}
