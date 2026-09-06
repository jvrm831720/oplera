import { describe, expect, test } from "bun:test";
import { planRecovery } from "../autonomy/planner.ts";
import type { PolicyDecision, RecoveryCandidate } from "../autonomy/types.ts";
import { SellerCopilotEngine } from "./next-best-action.ts";

function candidate(
	overrides: Partial<RecoveryCandidate> = {},
): RecoveryCandidate {
	return {
		id: "deal-contract",
		crmId: "deal-contract",
		contactName: "Mariana Costa",
		company: "Clínica Aurora",
		dealName: "Expansão Aurora",
		pipelineStage: "proposal",
		amount: 18_500,
		daysInactive: 12,
		lastActivity: "2026-09-06T12:00:00.000Z",
		originalReason: "",
		recoveryScore: 87,
		reasonCode: "high_intent_abandoned",
		reasonSummary: "Há sinais comerciais suficientes para revisar o próximo passo.",
		status: "engaged",
		nextAction: "Confirmar próximo passo.",
		attempt: 1,
		assignee: "owner-1",
		channel: "whatsapp",
		evidence: ["Resposta recebida", "Negócio aberto"],
		conversation: [],
		signals: {
			previousEngagement: true,
			proposalSent: false,
			explicitBuyingQuestion: true,
			knownObjection: false,
			sellerDropped: false,
			lostReason: "none",
		},
		optedOut: false,
		activeHumanConversation: false,
		...overrides,
	};
}

const allowed: PolicyDecision = {
	result: "allowed",
	reasons: ["policy_passed"],
};

function input(
	overrides: Partial<Parameters<SellerCopilotEngine["decide"]>[0]> = {},
): Parameters<SellerCopilotEngine["decide"]>[0] {
	const item = candidate();
	return {
		candidate: item,
		plan: planRecovery(item),
		policy: allowed,
		serviceWindowStatus: "open",
		decision: null,
		latestInbound: null,
		latestOutbound: null,
		nextTask: null,
		handoff: null,
		now: "2026-09-06T15:00:00.000Z",
		...overrides,
	};
}

function verifyContract(
	result: ReturnType<SellerCopilotEngine["decide"]>,
	expected: {
		type: ReturnType<SellerCopilotEngine["decide"]>["type"];
		urgency: ReturnType<SellerCopilotEngine["decide"]>["urgency"];
		policy: PolicyDecision["result"];
		requiresApproval?: boolean;
	},
) {
	expect(result.type).toBe(expected.type);
	expect(result.urgency).toBe(expected.urgency);
	expect(result.why.trim().length).toBeGreaterThan(0);
	expect(result.evidence.length).toBeGreaterThan(0);
	expect(result.policyResult).toBe(expected.policy);
	expect(result.requiresApproval).toBe(expected.requiresApproval ?? false);
}

describe("SellerCopilotEngine decision contract", () => {
	const engine = new SellerCopilotEngine();

	test("opt-out", () => {
		verifyContract(
			engine.decide(input({ candidate: candidate({ optedOut: true, status: "suppressed" }) })),
			{ type: "do_not_contact", urgency: "critical", policy: "blocked" },
		);
	});

	test("policy blocked", () => {
		verifyContract(
			engine.decide(input({ policy: { result: "blocked", reasons: ["blocked_by_hours"] } })),
			{ type: "do_not_contact", urgency: "high", policy: "blocked" },
		);
	});

	test("requires approval", () => {
		const proposal = candidate({
			reasonCode: "proposal_ghosted",
			signals: { ...candidate().signals, proposalSent: true },
		});
		verifyContract(
			engine.decide(
				input({
					candidate: proposal,
					plan: planRecovery(proposal),
					policy: {
						result: "requires_approval",
						reasons: ["whatsapp_service_window_closed"],
					},
					serviceWindowStatus: "closed",
				}),
			),
			{
				type: "proposal_followup",
				urgency: "medium",
				policy: "requires_approval",
				requiresApproval: true,
			},
		);
	});

	test("inbound não respondido", () => {
		verifyContract(
			engine.decide(
				input({
					latestInbound: {
						text: "Podemos falar amanhã?",
						timestamp: "2026-09-06T14:30:00.000Z",
					},
					latestOutbound: {
						text: "Oi, Mariana",
						timestamp: "2026-09-06T13:00:00.000Z",
					},
				}),
			),
			{ type: "reply_now", urgency: "high", policy: "allowed" },
		);
	});

	test("positive intent", () => {
		verifyContract(
			engine.decide(
				input({
					decision: {
						intent: "positive",
						objection: null,
						state: "handoff",
						shouldHandoff: true,
						recommendedAction: "Transferir ao vendedor.",
					},
				}),
			),
			{ type: "advance_stage", urgency: "high", policy: "allowed" },
		);
	});

	test("budget objection", () => {
		verifyContract(
			engine.decide(
				input({
					decision: {
						intent: "objection",
						objection: "budget",
						state: "objection_handling",
						shouldHandoff: false,
						recommendedAction: "Confirmar orçamento.",
					},
				}),
			),
			{ type: "budget_recheck", urgency: "medium", policy: "allowed" },
		);
	});

	test("timing objection", () => {
		verifyContract(
			engine.decide(
				input({
					decision: {
						intent: "objection",
						objection: "timing",
						state: "reason_discovery",
						shouldHandoff: false,
						recommendedAction: "Confirmar timing.",
					},
				}),
			),
			{ type: "timing_confirm", urgency: "medium", policy: "allowed" },
		);
	});

	test("proposal ghosted", () => {
		const proposal = candidate({
			reasonCode: "proposal_ghosted",
			signals: { ...candidate().signals, proposalSent: true },
		});
		verifyContract(
			engine.decide(input({ candidate: proposal, plan: planRecovery(proposal) })),
			{ type: "proposal_followup", urgency: "medium", policy: "allowed" },
		);
	});

	test("human handoff", () => {
		verifyContract(
			engine.decide(
				input({
					handoff: {
						reason: "legal_or_contract",
						summary: "Questão contratual",
						context: [],
						recommendedAction: "Encaminhar ao responsável.",
						status: "open",
						createdAt: "2026-09-06T14:00:00.000Z",
					},
				}),
			),
			{ type: "manual_handoff", urgency: "high", policy: "allowed" },
		);
	});

	test("due recovery task", () => {
		verifyContract(
			engine.decide(
				input({
					nextTask: {
						id: "task-1",
						taskType: "send_message",
						status: "pending",
						dueAt: "2026-09-06T14:00:00.000Z",
						priority: 10,
						payload: {},
					},
				}),
			),
			{ type: "due_recovery_task", urgency: "high", policy: "allowed" },
		);
	});

	test("active human conversation", () => {
		verifyContract(
			engine.decide(
				input({
					candidate: candidate({ activeHumanConversation: true }),
					policy: { result: "blocked", reasons: ["active_human_conversation"] },
				}),
			),
			{ type: "active_human", urgency: "high", policy: "blocked" },
		);
	});

	test("insufficient evidence", () => {
		const sparse = candidate({
			reasonCode: "stale_low_intent",
			evidence: [],
			signals: {
				previousEngagement: false,
				proposalSent: false,
				explicitBuyingQuestion: false,
				knownObjection: false,
				sellerDropped: false,
				lostReason: "none",
			},
		});
		verifyContract(
			engine.decide(input({ candidate: sparse, plan: planRecovery(sparse) })),
			{ type: "review_opportunity", urgency: "low", policy: "allowed" },
		);
	});
});
