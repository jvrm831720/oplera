import type { ConversationMessage } from "../domain/recovery.ts";
import { defaultRecoveryPolicy } from "./policy-engine.ts";
import { planRecovery } from "./planner.ts";
import { scoreRecoveryCandidate } from "./scoring.ts";
import type {
	OperatorConsoleSnapshot,
	RecoveryCandidate,
	RecoveryEvent,
	RecoveryHandoff,
	RecoveryMessage,
	RecoveryTask,
} from "./types.ts";

type TimeUnit = "minutes" | "hours" | "days";

function ago(reference: Date, amount: number, unit: TimeUnit): string {
	const multiplier = unit === "minutes" ? 60_000 : unit === "hours" ? 3_600_000 : 86_400_000;
	return new Date(reference.getTime() - amount * multiplier).toISOString();
}

function future(reference: Date, hours: number): string {
	return new Date(reference.getTime() + hours * 3_600_000).toISOString();
}

function conversation(reference: Date, rows: Array<["inbound" | "outbound", string, number, TimeUnit]>): ConversationMessage[] {
	return rows.map(([direction, text, amount, unit]) => ({
		direction,
		text,
		timestamp: ago(reference, amount, unit),
	}));
}

type Seed = Omit<RecoveryCandidate, "recoveryScore" | "reasonCode" | "reasonSummary">;

function scored(seed: Seed): RecoveryCandidate {
	const result = scoreRecoveryCandidate({
		amount: seed.amount,
		daysInactive: seed.daysInactive,
		signals: seed.signals,
		optedOut: seed.optedOut,
		activeHumanConversation: seed.activeHumanConversation,
	});
	return {
		...seed,
		recoveryScore: result.score,
		reasonCode: result.reasonCode,
		reasonSummary: result.reasonSummary,
	};
}

export function demoCandidates(reference = new Date()): RecoveryCandidate[] {
	return [
		scored({
			id: "opp-proposal-ghosted",
			crmId: "CRM-1042",
			contactName: "Mariana Costa",
			company: "Clínica Aurora",
			dealName: "Expansão atendimento digital",
			pipelineStage: "Proposal sent",
			amount: 18_500,
			daysInactive: 0,
			lastActivity: ago(reference, 2, "hours"),
			originalReason: "Proposal sent, no follow-up after buying question",
			status: "scheduled",
			nextAction: "Follow up on proposal inside WhatsApp service window",
			dueAt: ago(reference, 10, "minutes"),
			attempt: 0,
			assignee: "Oplera",
			channel: "whatsapp",
			evidence: ["proposal sent", "customer asked payment terms", "last inbound 2h ago"],
			conversation: conversation(reference, [
				["outbound", "Enviei a proposta aprovada no CRM.", 3, "hours"],
				["inbound", "Consigo começar ainda este mês? Como funciona o pagamento?", 2, "hours"],
			]),
			signals: { previousEngagement: true, proposalSent: true, explicitBuyingQuestion: true, knownObjection: false, sellerDropped: false, lostReason: "none" },
			optedOut: false,
			activeHumanConversation: false,
		}),
		scored({
			id: "opp-timing",
			crmId: "CRM-0984",
			contactName: "Bruno Tavares",
			company: "Tavares Engenharia",
			dealName: "Automação comercial",
			pipelineStage: "Closed lost",
			amount: 26_000,
			daysInactive: 34,
			lastActivity: ago(reference, 34, "days"),
			originalReason: "Lost due to timing",
			status: "planned",
			nextAction: "Revalidate timing using approved outreach path",
			dueAt: future(reference, 4),
			attempt: 0,
			assignee: "Oplera",
			channel: "whatsapp",
			evidence: ["timing objection", "positive discovery call", "no opt-out"],
			conversation: conversation(reference, [["inbound", "Gostei, mas vamos retomar isso no próximo mês.", 34, "days"]]),
			signals: { previousEngagement: true, proposalSent: false, explicitBuyingQuestion: false, knownObjection: true, sellerDropped: false, lostReason: "timing" },
			optedOut: false,
			activeHumanConversation: false,
		}),
		scored({
			id: "opp-seller-dropped",
			crmId: "CRM-1108",
			contactName: "Patrícia Souza",
			company: "Norte Log",
			dealName: "Projeto de recuperação inbound",
			pipelineStage: "Negotiation",
			amount: 11_800,
			daysInactive: 12,
			lastActivity: ago(reference, 12, "days"),
			originalReason: "Seller stopped replying",
			status: "eligible",
			nextAction: "Repair seller drop with factual context",
			dueAt: future(reference, 2),
			attempt: 0,
			assignee: "Oplera",
			channel: "email",
			evidence: ["customer asked implementation date", "seller stopped replying"],
			conversation: conversation(reference, [["inbound", "Qual a primeira data disponível para começar?", 12, "days"]]),
			signals: { previousEngagement: true, proposalSent: false, explicitBuyingQuestion: true, knownObjection: false, sellerDropped: true, lostReason: "none" },
			optedOut: false,
			activeHumanConversation: false,
		}),
		scored({
			id: "opp-budget",
			crmId: "CRM-0871",
			contactName: "Diego Martins",
			company: "Martins Odonto",
			dealName: "Plano enterprise",
			pipelineStage: "Objection",
			amount: 9_200,
			daysInactive: 21,
			lastActivity: ago(reference, 21, "days"),
			originalReason: "Budget objection",
			status: "engaged",
			nextAction: "Clarify budget without autonomous discount",
			attempt: 1,
			assignee: "Oplera",
			channel: "email",
			evidence: ["budget objection", "proposal reviewed", "no rejection"],
			conversation: conversation(reference, [["inbound", "O valor ficou acima do que eu tinha separado.", 21, "days"]]),
			signals: { previousEngagement: true, proposalSent: true, explicitBuyingQuestion: false, knownObjection: true, sellerDropped: false, lostReason: "budget" },
			optedOut: false,
			activeHumanConversation: false,
		}),
		scored({
			id: "opp-opt-out",
			crmId: "CRM-0762",
			contactName: "Ana Ribeiro",
			company: "Ribeiro Decor",
			dealName: "Retomada comercial",
			pipelineStage: "Stale",
			amount: 4_500,
			daysInactive: 18,
			lastActivity: ago(reference, 18, "days"),
			originalReason: "Contact opted out",
			status: "suppressed",
			nextAction: "No action — opt-out enforced",
			attempt: 1,
			assignee: "Suppressed",
			channel: "whatsapp",
			evidence: ["explicit opt-out message"],
			conversation: conversation(reference, [["inbound", "Por favor não me mande mais mensagens.", 18, "days"]]),
			signals: { previousEngagement: true, proposalSent: false, explicitBuyingQuestion: false, knownObjection: false, sellerDropped: false, lostReason: "none" },
			optedOut: true,
			activeHumanConversation: false,
		}),
		scored({
			id: "opp-active-human",
			crmId: "CRM-1201",
			contactName: "Ricardo Alves",
			company: "Alves Tecnologia",
			dealName: "Upgrade operação",
			pipelineStage: "Negotiation",
			amount: 31_000,
			daysInactive: 0,
			lastActivity: ago(reference, 1, "hours"),
			originalReason: "Human seller currently active",
			status: "suppressed",
			nextAction: "Wait for active human conversation to finish",
			attempt: 0,
			assignee: "Camila (human)",
			channel: "whatsapp",
			evidence: ["seller message 1h ago", "conversation is active"],
			conversation: conversation(reference, [["inbound", "Pode mandar o contrato para a Camila.", 1, "hours"]]),
			signals: { previousEngagement: true, proposalSent: true, explicitBuyingQuestion: true, knownObjection: false, sellerDropped: false, lostReason: "none" },
			optedOut: false,
			activeHumanConversation: true,
		}),
		scored({
			id: "opp-recovered",
			crmId: "CRM-0664",
			contactName: "Camila Nunes",
			company: "Nunes Arquitetura",
			dealName: "Reativação anual",
			pipelineStage: "Closed won",
			amount: 7_600,
			daysInactive: 0,
			lastActivity: ago(reference, 3, "hours"),
			originalReason: "Recovered after timing reactivation",
			status: "recovered",
			nextAction: "CRM sync completed",
			attempt: 2,
			assignee: "Oplera → Rafael",
			channel: "email",
			evidence: ["positive reply", "human handoff", "deal marked won"],
			conversation: conversation(reference, [["inbound", "Pode seguir, fechamos.", 3, "hours"]]),
			signals: { previousEngagement: true, proposalSent: true, explicitBuyingQuestion: true, knownObjection: false, sellerDropped: false, lostReason: "timing" },
			optedOut: false,
			activeHumanConversation: false,
		}),
		scored({
			id: "opp-handoff",
			crmId: "CRM-1258",
			contactName: "Fernanda Lima",
			company: "Vértice Educação",
			dealName: "Contrato multiunidade",
			pipelineStage: "Negotiation",
			amount: 48_000,
			daysInactive: 0,
			lastActivity: ago(reference, 40, "minutes"),
			originalReason: "High intent with contract question",
			status: "human_review",
			nextAction: "Human must handle contract terms",
			attempt: 1,
			assignee: "Revenue team",
			channel: "whatsapp",
			evidence: ["explicit buying intent", "contract clause question", "last inbound < 1h"],
			conversation: conversation(reference, [["inbound", "Quero fechar. Só preciso revisar a cláusula de cancelamento com alguém.", 40, "minutes"]]),
			signals: { previousEngagement: true, proposalSent: true, explicitBuyingQuestion: true, knownObjection: false, sellerDropped: false, lostReason: "none" },
			optedOut: false,
			activeHumanConversation: false,
		}),
	];
}

function task(id: string, opportunityId: string, type: RecoveryTask["taskType"], status: RecoveryTask["status"], dueAt: string, priority: number, attempt = 0): RecoveryTask {
	return {
		id,
		opportunityId,
		recoverySessionId: `session-${opportunityId}`,
		taskType: type,
		payload: {},
		priority,
		dueAt,
		attempt,
		maxAttempts: 3,
		createdAt: new Date(Date.parse(dueAt) - 3_600_000).toISOString(),
		status,
		idempotencyKey: `${opportunityId}:${type}:${attempt}`,
	};
}

export function buildDemoOperatorConsole(reference = new Date()): OperatorConsoleSnapshot {
	const opportunities = demoCandidates(reference);
	const plans = opportunities
		.filter((item) => !["suppressed", "recovered"].includes(item.status))
		.map((item) => planRecovery(item, defaultRecoveryPolicy.contact.maxAttempts));
	const tasks: RecoveryTask[] = [
		task("task-1", "opp-proposal-ghosted", "send_message", "pending", ago(reference, 10, "minutes"), 900),
		task("task-2", "opp-timing", "send_message", "pending", future(reference, 4), 500),
		task("task-3", "opp-seller-dropped", "plan", "pending", future(reference, 2), 600),
		task("task-4", "opp-budget", "check_reply", "succeeded", ago(reference, 4, "hours"), 550, 1),
		task("task-5", "opp-handoff", "handoff", "pending", ago(reference, 5, "minutes"), 1000, 1),
	];
	const messages: RecoveryMessage[] = opportunities.flatMap((opportunity) =>
		opportunity.conversation.map((message, index) => ({
			id: `${opportunity.id}-message-${index + 1}`,
			opportunityId: opportunity.id,
			actor: message.direction === "inbound" ? "customer" : "oplera",
			channel: opportunity.channel,
			text: message.text,
			timestamp: message.timestamp,
		})),
	);
	const handoffs: RecoveryHandoff[] = [
		{
			id: "handoff-contract",
			opportunityId: "opp-handoff",
			reason: "legal_or_contract",
			summary: "Cliente demonstrou alta intenção e pediu revisão de cláusula contratual.",
			context: ["Proposta já enviada", "Valor registrado: R$ 48.000", "Nenhum opt-out", "Pergunta contratual exige humano"],
			lastMessage: "Quero fechar. Só preciso revisar a cláusula de cancelamento com alguém.",
			recommendedAction: "Vendedor deve assumir a conversa e responder somente com termos aprovados.",
			createdAt: ago(reference, 30, "minutes"),
		},
	];
	const events: RecoveryEvent[] = [
		{ id: "event-1", timestamp: ago(reference, 5, "hours"), opportunityId: "opp-proposal-ghosted", actor: "agent", action: "candidate_discovered", inputSummary: "CRM context normalized", decision: "eligible", result: "Candidate added to recovery queue" },
		{ id: "event-2", timestamp: ago(reference, 4, "hours"), opportunityId: "opp-proposal-ghosted", actor: "agent", action: "recovery_scored", inputSummary: "Deterministic commercial signals", decision: "score calculated", result: "High recovery priority" },
		{ id: "event-3", timestamp: ago(reference, 3, "hours"), opportunityId: "opp-proposal-ghosted", actor: "policy", action: "policy_checked", inputSummary: "Contact + commercial + WhatsApp gates", decision: "allowed", policyResult: "allowed", toolInvoked: "resolveServiceWindow", result: "Last inbound is inside 24h service window" },
		{ id: "event-4", timestamp: ago(reference, 2, "hours"), opportunityId: "opp-handoff", actor: "agent", action: "human_handoff_requested", inputSummary: "Contract question", decision: "handoff", policyResult: "requires_approval", result: "Revenue team review required" },
		{ id: "event-5", timestamp: ago(reference, 1, "hours"), opportunityId: "opp-recovered", actor: "human", action: "opportunity_recovered", inputSummary: "Qualified handoff completed", decision: "won", result: "CRM status synchronized" },
	];
	const activeRecoverable = opportunities.filter((item) => !["suppressed", "recovered", "lost"].includes(item.status));
	const now = reference.getTime();
	const focus = tasks
		.filter((item) => item.status === "pending")
		.sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt))
		.slice(0, 4)
		.map((item) => ({ id: item.id, label: `${item.taskType.replaceAll("_", " ")} · ${opportunities.find((opportunity) => opportunity.id === item.opportunityId)?.contactName ?? item.opportunityId}`, dueAt: item.dueAt, reason: opportunities.find((opportunity) => opportunity.id === item.opportunityId)?.nextAction ?? "Scheduled by recovery planner" }));

	return {
		version: "0.4",
		companyName: "Clínica Aurora — Demo Mode",
		generatedAt: reference.toISOString(),
		agentStatus: "running",
		queue: {
			dueNow: tasks.filter((item) => item.status === "pending" && Date.parse(item.dueAt) <= now).length,
			scheduled: tasks.filter((item) => item.status === "pending" && Date.parse(item.dueAt) > now).length,
			processing: tasks.filter((item) => item.status === "leased" || item.status === "running").length,
			awaitingReply: opportunities.filter((item) => item.status === "awaiting_reply" || item.status === "engaged").length,
			humanReview: opportunities.filter((item) => item.status === "human_review").length,
		},
		recovery: {
			opportunitiesAnalyzed: opportunities.length,
			recoverable: activeRecoverable.length,
			contacted: opportunities.filter((item) => ["contacted", "awaiting_reply", "engaged", "human_review", "handed_off", "recovered"].includes(item.status)).length,
			engaged: opportunities.filter((item) => item.status === "engaged").length,
			handedOff: handoffs.length,
			recoveredWon: opportunities.filter((item) => item.status === "recovered").length,
			recoverableValue: activeRecoverable.reduce((sum, item) => sum + item.amount, 0),
			recoveredValue: opportunities.filter((item) => item.status === "recovered").reduce((sum, item) => sum + item.amount, 0),
		},
		agentFocus: focus,
		opportunities,
		plans,
		tasks,
		messages,
		handoffs,
		events,
		policy: defaultRecoveryPolicy,
	};
}
