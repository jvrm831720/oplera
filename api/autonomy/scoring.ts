import type { RecoveryReasonCode, RecoverySignals } from "./types.ts";

export interface RecoveryScoreInput {
	amount: number;
	daysInactive: number;
	signals: RecoverySignals;
	optedOut: boolean;
	activeHumanConversation: boolean;
	semanticContribution?: number;
}

export interface RecoveryScoreResult {
	recoverable: boolean;
	score: number;
	reasonCode: RecoveryReasonCode;
	reasonSummary: string;
	factors: Record<string, number>;
}

function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}

function classifyReason(signals: RecoverySignals): RecoveryReasonCode {
	if (signals.proposalSent) return "proposal_ghosted";
	if (signals.lostReason === "timing") return "lost_timing";
	if (signals.sellerDropped) return "seller_dropped";
	if (signals.lostReason === "budget" || signals.knownObjection)
		return "budget_objection";
	if (signals.explicitBuyingQuestion || signals.previousEngagement)
		return "high_intent_abandoned";
	return "stale_low_intent";
}

function summaryFor(reasonCode: RecoveryReasonCode): string {
	const summaries: Record<RecoveryReasonCode, string> = {
		proposal_ghosted:
			"A proposta foi enviada, houve engajamento comercial e o processo ficou sem próximo passo.",
		lost_timing:
			"A oportunidade parou por timing e já pode ser revisitada sem reconstruir o pipeline do zero.",
		seller_dropped:
			"O cliente demonstrou intenção, mas o fluxo comercial foi interrompido pelo lado vendedor.",
		budget_objection:
			"Existe objeção de orçamento conhecida e contexto suficiente para uma retomada controlada.",
		high_intent_abandoned:
			"Há sinais explícitos de compra ou engajamento anterior sem resolução comercial.",
		stale_low_intent:
			"A oportunidade está parada, mas os sinais de intenção ainda são fracos.",
	};
	return summaries[reasonCode];
}

/**
 * V0.4 deterministic score. The optional semantic contribution is deliberately
 * capped to +/-5 points so an AI provider cannot manufacture the final score.
 */
export function scoreRecoveryCandidate(
	input: RecoveryScoreInput,
): RecoveryScoreResult {
	const reasonCode = classifyReason(input.signals);
	const factors: Record<string, number> = { base: 20 };

	if (input.amount >= 20_000) factors.value = 15;
	else if (input.amount >= 8_000) factors.value = 10;
	else if (input.amount >= 2_500) factors.value = 5;
	else factors.value = 1;

	if (input.daysInactive <= 30) factors.inactivity = 15;
	else if (input.daysInactive <= 60) factors.inactivity = 8;
	else if (input.daysInactive <= 90) factors.inactivity = 2;
	else factors.inactivity = -8;

	if (input.signals.previousEngagement) factors.previousEngagement = 12;
	if (input.signals.proposalSent) factors.proposalSent = 12;
	if (input.signals.explicitBuyingQuestion) factors.explicitBuyingQuestion = 15;
	if (input.signals.knownObjection) factors.knownObjection = 5;
	if (input.signals.sellerDropped) factors.sellerDropped = 8;
	if (input.signals.lostReason === "timing") factors.lostTiming = 10;
	if (input.signals.lostReason === "budget") factors.lostBudget = 4;
	if (input.activeHumanConversation) factors.activeHumanConversation = -25;

	const semanticContribution = clamp(input.semanticContribution ?? 0, -5, 5);
	if (semanticContribution !== 0)
		factors.semanticContribution = semanticContribution;

	if (input.optedOut) {
		return {
			recoverable: false,
			score: 0,
			reasonCode,
			reasonSummary:
				"Contato com opt-out ativo. A oportunidade não pode ser trabalhada autonomamente.",
			factors: { ...factors, optOut: -100 },
		};
	}

	const score = clamp(
		Math.round(Object.values(factors).reduce((sum, value) => sum + value, 0)),
		0,
		100,
	);

	return {
		recoverable: score >= 35,
		score,
		reasonCode,
		reasonSummary: summaryFor(reasonCode),
		factors,
	};
}
