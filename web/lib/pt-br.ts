import type {
	PolicyDecision,
	RecoveryReasonCode,
	RecoveryStatus,
} from "../../api/autonomy/types.ts";

export const brlCurrency = new Intl.NumberFormat("pt-BR", {
	style: "currency",
	currency: "BRL",
	minimumFractionDigits: 2,
	maximumFractionDigits: 2,
});

export const integerNumber = new Intl.NumberFormat("pt-BR", {
	maximumFractionDigits: 0,
});

export const compactDateTime = new Intl.DateTimeFormat("pt-BR", {
	day: "2-digit",
	month: "short",
	hour: "2-digit",
	minute: "2-digit",
	hour12: false,
});

export const fullDateTime = new Intl.DateTimeFormat("pt-BR", {
	dateStyle: "short",
	timeStyle: "short",
	hour12: false,
});

const STATUS_LABELS: Record<RecoveryStatus, string> = {
	discovered: "Descoberta",
	eligible: "Elegível",
	planned: "Planejada",
	scheduled: "Agendada",
	contacted: "Contatada",
	awaiting_reply: "Aguardando resposta",
	engaged: "Em conversa",
	human_review: "Revisão humana",
	handed_off: "Encaminhada",
	recovered: "Recuperada",
	lost: "Perdida",
	suppressed: "Suprimida",
};

const REASON_LABELS: Record<RecoveryReasonCode, string> = {
	proposal_ghosted: "Proposta sem resposta",
	lost_timing: "Oportunidade pausada por timing",
	seller_dropped: "Conversa interrompida pelo vendedor",
	budget_objection: "Objeção de orçamento",
	high_intent_abandoned: "Alta intenção sem próximo passo",
	stale_low_intent: "Contexto antigo com baixa intenção",
};

const POLICY_LABELS: Record<PolicyDecision["result"], string> = {
	allowed: "Permitido",
	blocked: "Bloqueado",
	requires_approval: "Requer aprovação",
};

const AGENT_STATUS_LABELS: Record<string, string> = {
	running: "Em execução",
	paused: "Pausado",
	needs_attention: "Requer atenção",
};

const ACTOR_LABELS: Record<string, string> = {
	system: "Sistema",
	agent: "Agente",
	policy: "Política",
	provider: "Provedor",
	human: "Humano",
	customer: "Cliente",
	oplera: "Oplera",
};

const TASK_LABELS: Record<string, string> = {
	analyze: "Analisar",
	plan: "Planejar",
	send_message: "Enviar mensagem",
	check_reply: "Verificar resposta",
	handoff: "Encaminhar para humano",
	crm_sync: "Sincronizar CRM",
};

const STRATEGY_LABELS: Record<string, string> = {
	proposal_followup: "Retomada de proposta",
	timing_reactivation: "Reativação por timing",
	seller_drop_repair: "Retomada de conversa interrompida",
	budget_recheck: "Revalidação de orçamento",
	intent_reactivation: "Reativação de alta intenção",
	light_recheck: "Revisão leve de relevância",
};

const EVENT_ACTION_LABELS: Record<string, string> = {
	candidate_discovered: "Oportunidade identificada",
	policy_checked: "Política verificada",
	recovery_message_sent: "Mensagem de recuperação enviada",
	reply_observed: "Resposta observada",
	pilot_action_approved: "Ação do piloto aprovada",
};

const DEMO_TEXT: Record<string, string> = {
	"Proposal sent": "Proposta enviada",
	"Closed lost": "Fechada como perdida",
	Negotiation: "Negociação",
	Objection: "Objeção",
	Stale: "Parada",
	"Closed won": "Fechada como ganha",
	"Follow up on proposal inside WhatsApp service window":
		"Retomar a proposta dentro da janela de atendimento do WhatsApp",
	"Revalidate timing using approved outreach path":
		"Revalidar timing pelo caminho de contato aprovado",
	"Repair seller drop with factual context":
		"Retomar a conversa interrompida com contexto factual",
	"Clarify budget without autonomous discount":
		"Esclarecer orçamento sem desconto autônomo",
	"No action — opt-out enforced": "Nenhuma ação: opt-out aplicado",
	"Wait for active human conversation to finish":
		"Aguardar o término da conversa humana ativa",
	"CRM sync completed": "Sincronização com o CRM concluída",
	"Human must handle contract terms":
		"Um humano deve conduzir as questões contratuais",
	"Proposal sent, no follow-up after buying question":
		"Proposta enviada, sem retorno após pergunta de compra",
	"Lost due to timing": "Perdida por timing",
	"Seller stopped replying": "O vendedor deixou de responder",
	"Budget objection": "Objeção de orçamento",
	"Contact opted out": "Contato realizou opt-out",
	"Human seller currently active": "Vendedor humano em atendimento ativo",
	"Recovered after timing reactivation": "Recuperada após reativação por timing",
	"High intent with contract question": "Alta intenção com questão contratual",
	"proposal sent": "proposta enviada",
	"customer asked payment terms": "cliente perguntou sobre condições de pagamento",
	"last inbound 2h ago": "última mensagem recebida há 2 horas",
	"timing objection": "objeção de timing",
	"positive discovery call": "ligação de descoberta positiva",
	"no opt-out": "sem opt-out",
	"customer asked implementation date": "cliente perguntou a data de implementação",
	"seller stopped replying": "vendedor deixou de responder",
	"proposal reviewed": "proposta revisada",
	"no rejection": "sem rejeição",
	"explicit opt-out message": "mensagem explícita de opt-out",
	"seller message 1h ago": "mensagem do vendedor há 1 hora",
	"conversation is active": "conversa ativa",
	"positive reply": "resposta positiva",
	"human handoff": "encaminhamento humano",
	"deal marked won": "negócio marcado como ganho",
	"explicit buying intent": "intenção explícita de compra",
	"contract clause question": "pergunta sobre cláusula contratual",
	"last inbound < 1h": "última mensagem recebida há menos de 1 hora",
	"Suppressed": "Suprimida",
	"Camila (human)": "Camila (humano)",
	"Revenue team": "Equipe de Receita",
};

export function recoveryStatusLabel(status: RecoveryStatus): string {
	return STATUS_LABELS[status];
}

export function recoveryReasonLabel(reason: RecoveryReasonCode): string {
	return REASON_LABELS[reason];
}

export function policyResultLabel(result: PolicyDecision["result"]): string {
	return POLICY_LABELS[result];
}

export function agentStatusLabel(status: string): string {
	return AGENT_STATUS_LABELS[status] ?? humanizeInternal(status);
}

export function actorLabel(actor: string): string {
	return ACTOR_LABELS[actor] ?? humanizeInternal(actor);
}

export function taskTypeLabel(task: string): string {
	return TASK_LABELS[task] ?? humanizeInternal(task);
}

export function strategyLabel(strategy: string): string {
	return STRATEGY_LABELS[strategy] ?? humanizeInternal(strategy);
}

export function eventActionLabel(action: string): string {
	return EVENT_ACTION_LABELS[action] ?? humanizeInternal(action);
}

export function channelLabel(channel: string): string {
	if (channel === "whatsapp") return "WhatsApp";
	if (channel === "email") return "E-mail";
	return humanizeInternal(channel);
}

export function operationalText(value: string): string {
	return DEMO_TEXT[value] ?? value;
}

export function humanizeInternal(value: string): string {
	return value.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
}
