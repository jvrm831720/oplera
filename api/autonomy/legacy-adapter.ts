import type { RecoveryAnalysis } from "../domain/recovery.ts";
import { buildDemoOperatorConsole } from "./demo.ts";
import { scoreRecoveryCandidate } from "./scoring.ts";
import type { OperatorConsoleSnapshot, RecoveryCandidate } from "./types.ts";

export function buildOperatorConsoleFromAnalysis(
	analysis: RecoveryAnalysis,
	reference = new Date(analysis.generatedAt),
): OperatorConsoleSnapshot {
	const base = buildDemoOperatorConsole(reference);
	const opportunities: RecoveryCandidate[] = analysis.opportunities.map((item) => {
		const signals = {
			previousEngagement: item.conversation.length > 1,
			proposalSent: item.intentSignals.includes("proposta"),
			explicitBuyingQuestion: item.intentSignals.some((signal) => ["preço", "pagamento", "decisão"].includes(signal)),
			knownObjection: false,
			sellerDropped: item.lastMessageDirection === "inbound",
			lostReason: "none" as const,
		};
		const scored = scoreRecoveryCandidate({
			amount: item.estimatedValue,
			daysInactive: item.inactivityDays,
			signals,
			optedOut: false,
			activeHumanConversation: false,
		});
		return {
			id: item.id,
			crmId: item.id,
			contactName: item.contactName,
			company: analysis.companyName,
			dealName: `Recovery · ${item.contactName}`,
			pipelineStage: "Imported recovery context",
			amount: item.estimatedValue,
			daysInactive: item.inactivityDays,
			lastActivity: item.lastMessageAt,
			originalReason: item.reason,
			recoveryScore: scored.score,
			reasonCode: scored.reasonCode,
			reasonSummary: scored.reasonSummary,
			status: "eligible",
			nextAction: item.suggestedAction,
			attempt: 0,
			assignee: item.owner,
			channel: item.source.toLowerCase().includes("whatsapp") ? "whatsapp" : "email",
			evidence: [item.reason, ...item.intentSignals.map((signal) => `intent: ${signal}`)],
			conversation: item.conversation,
			signals,
			optedOut: false,
			activeHumanConversation: false,
		};
	});
	const recoverableValue = opportunities.reduce((sum, item) => sum + item.amount, 0);
	return {
		...base,
		companyName: analysis.companyName,
		generatedAt: analysis.generatedAt,
		recovery: {
			...base.recovery,
			opportunitiesAnalyzed: analysis.summary.totalConversations,
			recoverable: opportunities.length,
			recoverableValue,
		},
		opportunities,
		plans: [],
		tasks: [],
		messages: opportunities.flatMap((opportunity) => opportunity.conversation.map((message, index) => ({
			id: `${opportunity.id}-legacy-${index}`,
			opportunityId: opportunity.id,
			actor: message.direction === "inbound" ? "customer" as const : "oplera" as const,
			channel: opportunity.channel,
			text: message.text,
			timestamp: message.timestamp,
		}))),
		handoffs: [],
		events: [],
		agentFocus: opportunities.slice(0, 4).map((item) => ({ id: `focus-${item.id}`, label: `Review ${item.contactName}`, dueAt: reference.toISOString(), reason: item.nextAction })),
	};
}
