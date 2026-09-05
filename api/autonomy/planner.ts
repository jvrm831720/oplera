import type { RecoveryCandidate, RecoveryPlan, RecoveryReasonCode } from "./types.ts";

const STRATEGIES: Record<
	RecoveryReasonCode,
	Pick<RecoveryPlan, "strategy" | "objective" | "followUpAfterHours">
> = {
	proposal_ghosted: {
		strategy: "proposal_followup",
		objective: "Confirmar se a proposta continua relevante e identificar o bloqueio atual.",
		followUpAfterHours: 72,
	},
	lost_timing: {
		strategy: "timing_reactivation",
		objective: "Confirmar se o projeto voltou a ser prioridade sem presumir mudança de contexto.",
		followUpAfterHours: 96,
	},
	seller_dropped: {
		strategy: "seller_drop_repair",
		objective: "Retomar o ponto exato em que o cliente ficou sem resposta e restaurar continuidade.",
		followUpAfterHours: 48,
	},
	budget_objection: {
		strategy: "budget_recheck",
		objective: "Revalidar a objeção de orçamento sem oferecer desconto ou condição não autorizada.",
		followUpAfterHours: 96,
	},
	high_intent_abandoned: {
		strategy: "intent_reactivation",
		objective: "Confirmar intenção atual e preparar transferência rápida quando houver prontidão de compra.",
		followUpAfterHours: 48,
	},
	stale_low_intent: {
		strategy: "light_recheck",
		objective: "Fazer uma checagem leve de relevância antes de gastar novas tentativas.",
		followUpAfterHours: 120,
	},
};

export function planRecovery(candidate: RecoveryCandidate, maxAttempts = 3): RecoveryPlan {
	const strategy = STRATEGIES[candidate.reasonCode];
	return {
		candidateId: candidate.id,
		...strategy,
		channel: candidate.channel,
		maxAttempts,
		firstAction: {
			type:
				candidate.activeHumanConversation || candidate.optedOut
					? "human_review"
					: "send_message",
		},
	};
}
