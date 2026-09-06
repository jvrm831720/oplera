import { describe, expect, test } from "bun:test";
import { planRecovery } from "../autonomy/planner.ts";
import type {
	PolicyDecision,
	RecoveryCandidate,
} from "../autonomy/types.ts";
import { SellerCopilotEngine } from "./next-best-action.ts";

function candidate(
	overrides: Partial<RecoveryCandidate> = {},
): RecoveryCandidate {
	return {
		id: "deal-1",
		crmId: "deal-1",
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
		reasonSummary: "Há sinais de compra sem resolução comercial.",
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

const allowed: PolicyDecision = { result: "allowed", reasons: ["policy_passed"] };

function input(
	overrides: Partial<Parameters<SellerCopilotEngine["decide"]>[0]> = {},
) {
	const item = candidate();
	return {
		candidate: item,
		plan: planRecovery(item),
		policy: allowed,
		serviceWindowStatus: "open" as const,
		decision: null,
		latestInbound: null,
		latestOutbound: null,
		nextTask: null,
		handoff: null,
		now: "2026-09-06T15:00:00.000Z",
		...overrides,
	};
}

describe("SellerCopilotEngine", () => {
	const engine = new SellerCopilotEngine();

	test("não recomenda contato para opt-out ou suppressed", () => {
		const result = engine.decide(
			input({ candidate: candidate({ optedOut: true, status: "suppressed" }) }),
		);
		expect(result.type).toBe("do_not_contact");
		expect(result.title).toBe("Não entrar em contato");
		expect(result.urgency).toBe("critical");
		expect(result.suggestedMessage).toBeUndefined();
	});

	test("prioriza encaminhamento humano aberto", () => {
		const result = engine.decide(
			input({
				handoff: {
					reason: "legal_or_contract",
					summary: "Questão contratual",
					context: [],
					recommendedAction: "Encaminhar questão contratual ao responsável.",
					status: "open",
					createdAt: "2026-09-06T14:00:00.000Z",
				},
			}),
		);
		expect(result.type).toBe("manual_handoff");
		expect(result.title).toBe("Encaminhar para o responsável");
	});

	test("responde inbound mais recente sem outbound posterior", () => {
		const result = engine.decide(
			input({
				latestInbound: {
					text: "Podemos conversar amanhã?",
					timestamp: "2026-09-06T14:30:00.000Z",
				},
				latestOutbound: {
					text: "Oi, Mariana",
					timestamp: "2026-09-06T13:00:00.000Z",
				},
			}),
		);
		expect(result.type).toBe("reply_now");
		expect(result.title).toBe("Responder agora");
		expect(result.urgency).toBe("high");
	});

	test("avança intenção positiva para próxima etapa comercial", () => {
		const result = engine.decide(
			input({
				decision: {
					intent: "positive",
					objection: null,
					state: "handoff",
					shouldHandoff: true,
					recommendedAction: "Transferir ao vendedor.",
				},
			}),
		);
		expect(result.type).toBe("advance_stage");
		expect(result.title).toBe("Agendar reunião");
	});

	test("trata objeção de orçamento sem recomendar desconto", () => {
		const result = engine.decide(
			input({
				decision: {
					intent: "objection",
					objection: "budget",
					state: "objection_handling",
					shouldHandoff: false,
					recommendedAction: "Confirmar orçamento.",
					draftReply: "Podemos confirmar se orçamento continua sendo o principal ponto?",
				},
			}),
		);
		expect(result.type).toBe("budget_recheck");
		expect(result.title).toBe("Confirmar orçamento e prioridade");
		expect(result.description.toLowerCase()).not.toContain("oferecer desconto");
	});

	test("confirma janela de decisão para timing", () => {
		const result = engine.decide(
			input({
				decision: {
					intent: "objection",
					objection: "timing",
					state: "reason_discovery",
					shouldHandoff: false,
					recommendedAction: "Registrar timing.",
				},
			}),
		);
		expect(result.type).toBe("timing_confirm");
		expect(result.title).toBe("Confirmar a janela de decisão");
	});

	test("retoma proposta ghosted mas respeita aprovação", () => {
		const proposal = candidate({
			reasonCode: "proposal_ghosted",
			signals: { ...candidate().signals, proposalSent: true },
		});
		const result = engine.decide(
			input({
				candidate: proposal,
				plan: planRecovery(proposal),
				serviceWindowStatus: "closed",
				policy: {
					result: "requires_approval",
					reasons: ["whatsapp_service_window_closed"],
				},
			}),
		);
		expect(result.type).toBe("proposal_followup");
		expect(result.requiresApproval).toBe(true);
		expect(result.suggestedMessage).toBeUndefined();
	});

	test("reflete tarefa due já decidida pelo Planner", () => {
		const result = engine.decide(
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
		);
		expect(result.type).toBe("due_recovery_task");
		expect(result.urgency).toBe("high");
	});

	test("não disputa conversa humana ativa", () => {
		const result = engine.decide(
			input({
				candidate: candidate({ activeHumanConversation: true }),
				policy: { result: "blocked", reasons: ["active_human_conversation"] },
			}),
		);
		expect(result.type).toBe("active_human");
		expect(result.title).toBe("Continuar atendimento humano");
	});

	test("revisa oportunidade quando a evidência é insuficiente", () => {
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
		const result = engine.decide(
			input({ candidate: sparse, plan: planRecovery(sparse) }),
		);
		expect(result.type).toBe("review_opportunity");
		expect(result.title).toBe("Revisar oportunidade");
	});

	test("bloqueio de policy impede sugestão outbound", () => {
		const result = engine.decide(
			input({ policy: { result: "blocked", reasons: ["blocked_by_hours"] } }),
		);
		expect(result.type).toBe("do_not_contact");
		expect(result.suggestedMessage).toBeUndefined();
	});
});
