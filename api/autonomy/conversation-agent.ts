import type { ConversationState, RecoveryCandidate, RecoveryPolicy } from "./types.ts";

export interface ConversationDecision {
	intent: "positive" | "question" | "objection" | "not_interested" | "opt_out" | "human_request" | "complaint" | "unknown";
	objection: "budget" | "timing" | "contract" | "customization" | null;
	state: ConversationState;
	shouldHandoff: boolean;
	handoffReason?: string;
	recommendedAction: string;
	draftReply?: string;
}

function firstName(name: string): string {
	return name.trim().split(/\s+/)[0] ?? name;
}

/**
 * Deterministic demo conversation policy. A real AIProvider may enrich intent
 * classification, but it cannot bypass policy or fabricate commercial facts.
 */
export function decideConversationReply(
	candidate: RecoveryCandidate,
	text: string,
	policy: RecoveryPolicy,
): ConversationDecision {
	const normalized = text.toLowerCase();
	const name = firstName(candidate.contactName);

	if (/pare|parar|remover|descadastr|n[aã]o me chame|stop/.test(normalized)) {
		return {
			intent: "opt_out",
			objection: null,
			state: "closed",
			shouldHandoff: false,
			recommendedAction: "Suppress contact immediately and record opt-out.",
		};
	}

	if (/humano|pessoa|vendedor|atendente|consultor/.test(normalized)) {
		return {
			intent: "human_request",
			objection: null,
			state: "handoff",
			shouldHandoff: true,
			handoffReason: "customer_requested_human",
			recommendedAction: "Transferir para o vendedor responsável com contexto factual.",
		};
	}

	if (/reclama|absurdo|péssim|pessim|engan|procon/.test(normalized)) {
		return {
			intent: "complaint",
			objection: null,
			state: "handoff",
			shouldHandoff: policy.handoff.complaintToHuman,
			handoffReason: "complaint",
			recommendedAction: "Interromper negociação autônoma e encaminhar reclamação a um humano.",
		};
	}

	if (/contrato|jur[ií]d|cl[aá]usula/.test(normalized)) {
		return {
			intent: "question",
			objection: "contract",
			state: "handoff",
			shouldHandoff: policy.handoff.legalOrContractToHuman,
			handoffReason: "legal_or_contract",
			recommendedAction: "Encaminhar questão contratual sem interpretar cláusulas autonomamente.",
		};
	}

	if (/custom|integra[cç][aã]o especial|sob medida/.test(normalized)) {
		return {
			intent: "question",
			objection: "customization",
			state: "handoff",
			shouldHandoff: policy.handoff.unknownCustomizationToHuman,
			handoffReason: "unknown_customization",
			recommendedAction: "Pedir avaliação humana antes de prometer customização.",
		};
	}

	if (/caro|or[cç]amento|desconto|pre[cç]o|valor/.test(normalized)) {
		return {
			intent: "objection",
			objection: "budget",
			state: "objection_handling",
			shouldHandoff: false,
			recommendedAction: "Confirmar a objeção e consultar apenas condições já registradas no CRM.",
			draftReply: `Entendi, ${name}. Posso registrar que o orçamento é o principal ponto e verificar apenas as condições que já estão aprovadas para esta oportunidade, sem inventar desconto ou prazo.`,
		};
	}

	if (/depois|m[eê]s que vem|agora n[aã]o|timing|mais pra frente/.test(normalized)) {
		return {
			intent: "objection",
			objection: "timing",
			state: "reason_discovery",
			shouldHandoff: false,
			recommendedAction: "Registrar timing e agendar recheck com motivo explícito.",
			draftReply: `Entendi, ${name}. Posso deixar registrado que o momento ainda não é o ideal e retomar mais adiante, sem mudar nenhuma condição por conta própria.`,
		};
	}

	if (/n[aã]o tenho interesse|n[aã]o quero|desisti|j[aá] fechei/.test(normalized)) {
		return {
			intent: "not_interested",
			objection: null,
			state: "closed",
			shouldHandoff: false,
			recommendedAction: "Encerrar recovery session e não criar novo follow-up.",
		};
	}

	if (/quero|vamos fechar|pode marcar|tenho interesse|como pago|assinar/.test(normalized)) {
		const shouldHandoff = policy.handoff.highIntentToHuman;
		return {
			intent: "positive",
			objection: null,
			state: shouldHandoff ? "handoff" : "qualification",
			shouldHandoff,
			handoffReason: shouldHandoff ? "high_intent" : undefined,
			recommendedAction: shouldHandoff
				? "Transferir imediatamente ao vendedor com resumo e última mensagem."
				: "Continuar qualificação dentro das policies.",
		};
	}

	return {
		intent: "unknown",
		objection: null,
		state: "interest_check",
		shouldHandoff: policy.handoff.lowEvidenceToHuman,
		handoffReason: policy.handoff.lowEvidenceToHuman ? "insufficient_evidence" : undefined,
		recommendedAction: policy.handoff.lowEvidenceToHuman
			? "Solicitar revisão humana por evidência insuficiente."
			: "Fazer pergunta curta de clarificação sem assumir fatos.",
	};
}
