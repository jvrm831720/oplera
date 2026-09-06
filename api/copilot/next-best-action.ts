import type { ConversationDecision } from "../autonomy/conversation-agent.ts";
import { draftRecoveryMessage } from "../autonomy/engine.ts";
import type {
	PolicyDecision,
	RecoveryCandidate,
	RecoveryPlan,
} from "../autonomy/types.ts";
import type {
	InternalRecoveryHandoff,
	InternalRecoveryTask,
} from "./internal-context.ts";
import type {
	CopilotServiceWindowStatus,
	SellerCopilotNextBestAction,
} from "./types.ts";

export interface SellerCopilotEngineInput {
	candidate: RecoveryCandidate;
	plan: RecoveryPlan;
	policy: PolicyDecision;
	serviceWindowStatus: CopilotServiceWindowStatus;
	decision: ConversationDecision | null;
	latestInbound: { text: string; timestamp: string } | null;
	latestOutbound: { text: string; timestamp: string } | null;
	nextTask: InternalRecoveryTask | null;
	handoff: InternalRecoveryHandoff | null;
	now: string;
}

function preview(value: string, max = 160): string {
	const normalized = value.replace(/\s+/g, " ").trim();
	return normalized.length <= max
		? normalized
		: `${normalized.slice(0, max - 1)}…`;
}

function isUnansweredInbound(input: SellerCopilotEngineInput): boolean {
	if (!input.latestInbound) return false;
	if (!input.latestOutbound) return true;
	return (
		Date.parse(input.latestInbound.timestamp) >
		Date.parse(input.latestOutbound.timestamp)
	);
}

function baseEvidence(input: SellerCopilotEngineInput): string[] {
	const evidence: string[] = [];
	if (input.latestInbound)
		evidence.push(
			`Última mensagem recebida: “${preview(input.latestInbound.text)}”`,
		);
	if (input.nextTask)
		evidence.push(
			`Tarefa ${input.nextTask.taskType.replaceAll("_", " ")} com vencimento em ${input.nextTask.dueAt}.`,
		);
	if (input.candidate.reasonSummary)
		evidence.push(input.candidate.reasonSummary);
	return evidence.slice(0, 3);
}

function blocked(
	input: SellerCopilotEngineInput,
	reason: string,
	urgency: "high" | "critical" = "high",
): SellerCopilotNextBestAction {
	return {
		type: "do_not_contact",
		title: "Não entrar em contato",
		description: reason,
		urgency,
		why: reason,
		evidence: baseEvidence(input),
		policyResult: "blocked",
		requiresApproval: false,
	};
}

function applyOutboundPolicy(
	input: SellerCopilotEngineInput,
	action: Omit<
		SellerCopilotNextBestAction,
		"policyResult" | "requiresApproval" | "suggestedMessage"
	> & { suggestedMessage?: string },
): SellerCopilotNextBestAction {
	if (input.policy.result === "blocked") {
		return blocked(
			input,
			`A política de contato bloqueou esta ação: ${input.policy.reasons.join(", ")}.`,
		);
	}
	const requiresApproval = input.policy.result === "requires_approval";
	return {
		...action,
		policyResult: input.policy.result,
		requiresApproval,
		suggestedMessage:
			input.policy.result === "allowed" ? action.suggestedMessage : undefined,
	};
}

export class SellerCopilotEngine {
	decide(input: SellerCopilotEngineInput): SellerCopilotNextBestAction {
		if (input.candidate.optedOut || input.candidate.status === "suppressed") {
			return blocked(
				input,
				input.candidate.optedOut
					? "O contato possui opt-out ativo e não deve receber nova abordagem."
					: "A oportunidade está suprimida pelas políticas da Oplera.",
				"critical",
			);
		}

		if (input.handoff || input.candidate.status === "human_review") {
			const reason =
				input.handoff?.recommendedAction ||
				input.decision?.recommendedAction ||
				"A oportunidade exige revisão humana antes de qualquer continuação.";
			return {
				type: "manual_handoff",
				title: input.handoff
					? "Encaminhar para o responsável"
					: "Assumir atendimento manual",
				description: reason,
				urgency: "high",
				why: reason,
				evidence: baseEvidence(input),
				policyResult: input.policy.result,
				requiresApproval: input.policy.result === "requires_approval",
			};
		}

		if (input.candidate.activeHumanConversation) {
			return {
				type: "active_human",
				title: "Continuar atendimento humano",
				description:
					"Um vendedor já está conduzindo esta conversa. O Agente de Receita não deve disputar o atendimento.",
				urgency: "high",
				why: "A oportunidade está marcada com conversa humana ativa.",
				evidence: baseEvidence(input),
				policyResult: input.policy.result,
				requiresApproval: false,
			};
		}

		if (input.nextTask) {
			if (input.nextTask.taskType === "handoff") {
				return {
					type: "manual_handoff",
					title: "Encaminhar para o responsável",
					description:
						"A próxima tarefa já decidida pelo Planner é um encaminhamento humano.",
					urgency: "high",
					why: "Existe uma tarefa de encaminhamento pendente na fila da Oplera.",
					evidence: baseEvidence(input),
					policyResult: input.policy.result,
					requiresApproval: input.policy.result === "requires_approval",
				};
			}
			return applyOutboundPolicy(input, {
				type: "due_recovery_task",
				title:
					input.nextTask.taskType === "send_message"
						? "Executar a próxima ação planejada"
						: "Revisar a tarefa de recuperação",
				description:
					"O Copilot está refletindo a tarefa já decidida pelo Planner, sem criar uma ação concorrente.",
				urgency:
					Date.parse(input.nextTask.dueAt) <= Date.parse(input.now)
						? "high"
						: "medium",
				why: `A tarefa ${input.nextTask.taskType.replaceAll("_", " ")} já está na fila da Oplera.`,
				evidence: baseEvidence(input),
				suggestedMessage:
					input.nextTask.taskType === "send_message"
						? draftRecoveryMessage(input.candidate)
						: undefined,
			});
		}

		if (input.decision?.intent === "positive") {
			return applyOutboundPolicy(input, {
				type: "advance_stage",
				title: "Agendar reunião",
				description:
					"Avance para a próxima etapa comercial e transfira o contexto ao responsável quando necessário.",
				urgency: "high",
				why: "A última resposta foi classificada como intenção positiva de compra.",
				evidence: baseEvidence(input),
			});
		}

		if (input.decision?.objection === "budget") {
			return applyOutboundPolicy(input, {
				type: "budget_recheck",
				title: "Confirmar orçamento e prioridade",
				description:
					"Confirme se orçamento continua sendo o principal bloqueio antes de discutir qualquer desconto.",
				urgency: isUnansweredInbound(input) ? "high" : "medium",
				why: "A conversa contém uma objeção de orçamento identificada pela Oplera.",
				evidence: baseEvidence(input),
				suggestedMessage: input.decision.draftReply,
			});
		}

		if (input.decision?.objection === "timing") {
			return applyOutboundPolicy(input, {
				type: "timing_confirm",
				title: "Confirmar a janela de decisão",
				description:
					"Valide quando a oportunidade pretende retomar a decisão e mantenha o próximo contato ancorado nesse momento.",
				urgency: isUnansweredInbound(input) ? "high" : "medium",
				why: "A última conversa foi classificada com objeção de timing.",
				evidence: baseEvidence(input),
				suggestedMessage: input.decision.draftReply,
			});
		}

		if (isUnansweredInbound(input)) {
			return applyOutboundPolicy(input, {
				type: "reply_now",
				title: "Responder agora",
				description:
					"Existe uma mensagem recebida mais recente que a última resposta registrada.",
				urgency: "high",
				why: "O último inbound ainda não possui outbound posterior na Oplera.",
				evidence: baseEvidence(input),
				suggestedMessage: input.decision?.draftReply,
			});
		}

		if (input.candidate.reasonCode === "proposal_ghosted") {
			return applyOutboundPolicy(input, {
				type: "proposal_followup",
				title: "Retomar a proposta com contexto",
				description:
					input.serviceWindowStatus === "open"
						? "Retome a proposta a partir do contexto já registrado."
						: "A retomada deve respeitar a janela de atendimento e eventual aprovação exigida.",
				urgency: "medium",
				why: input.candidate.reasonSummary,
				evidence: baseEvidence(input),
				suggestedMessage: draftRecoveryMessage(input.candidate),
			});
		}

		if (
			input.candidate.reasonCode === "lost_timing" ||
			input.candidate.signals.lostReason === "timing"
		) {
			return applyOutboundPolicy(input, {
				type: "timing_confirm",
				title: "Confirmar a janela de decisão",
				description:
					"Revalide se o momento mudou antes de avançar a oportunidade.",
				urgency: "medium",
				why: input.candidate.reasonSummary,
				evidence: baseEvidence(input),
				suggestedMessage: draftRecoveryMessage(input.candidate),
			});
		}

		if (
			input.candidate.reasonCode === "budget_objection" ||
			input.candidate.signals.lostReason === "budget"
		) {
			return applyOutboundPolicy(input, {
				type: "budget_recheck",
				title: "Confirmar orçamento e prioridade",
				description:
					"Revalide a objeção antes de discutir desconto ou condição comercial.",
				urgency: "medium",
				why: input.candidate.reasonSummary,
				evidence: baseEvidence(input),
				suggestedMessage: draftRecoveryMessage(input.candidate),
			});
		}

		if (
			input.candidate.evidence.length < 2 ||
			input.candidate.reasonCode === "stale_low_intent"
		) {
			return {
				type: "review_opportunity",
				title: "Revisar oportunidade",
				description:
					"Não há evidência suficiente para recomendar uma ação comercial com confiança.",
				urgency: "low",
				why: "A Oplera evita sugerir uma abordagem quando o contexto disponível é insuficiente.",
				evidence: baseEvidence(input),
				policyResult: input.policy.result,
				requiresApproval: input.policy.result === "requires_approval",
			};
		}

		return applyOutboundPolicy(input, {
			type: "reply_now",
			title: "Validar o próximo passo comercial",
			description: input.plan.objective,
			urgency: "medium",
			why: input.candidate.reasonSummary,
			evidence: baseEvidence(input),
			suggestedMessage: draftRecoveryMessage(input.candidate),
		});
	}
}
