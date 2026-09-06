import {
	type ConversationDecision,
	decideConversationReply,
} from "../autonomy/conversation-agent.ts";
import { planRecovery } from "../autonomy/planner.ts";
import {
	defaultRecoveryPolicy,
	evaluateRecoveryPolicy,
} from "../autonomy/policy-engine.ts";
import {
	conversationStateSchema,
	type RecoveryCandidate,
} from "../autonomy/types.ts";
import type { ConversationMessage } from "../domain/recovery.ts";
import { resolveServiceWindow } from "../domain/recovery.ts";
import type {
	HubSpotCopilotSearchInput,
	HubSpotSellerCopilotSource,
} from "../pilot/hubspot.ts";
import type {
	InternalRecoveryDecision,
	InternalRecoveryMessage,
	InternalRevenueContext,
	InternalRevenueContextReader,
} from "./internal-context.ts";
import { SellerCopilotEngine } from "./next-best-action.ts";
import type {
	CopilotResolveInput,
	CopilotResolveMatch,
	CopilotResolveResult,
	CopilotServiceWindowStatus,
	SellerCopilotContext,
	SellerCopilotTimelineItem,
} from "./types.ts";

export interface RevenueContextHubSpotProvider {
	getSellerCopilotSource(
		id: string,
	): Promise<HubSpotSellerCopilotSource | null>;
	searchSellerCopilotSources(
		input: HubSpotCopilotSearchInput,
	): Promise<Array<{ source: HubSpotSellerCopilotSource; score: number }>>;
}

function truncate(value: string, max = 220): string {
	const normalized = value.replace(/\s+/g, " ").trim();
	return normalized.length <= max
		? normalized
		: `${normalized.slice(0, max - 1)}…`;
}

function asRecord(value: unknown): Record<string, unknown> {
	return value && typeof value === "object"
		? (value as Record<string, unknown>)
		: {};
}

const INTENTS: ConversationDecision["intent"][] = [
	"positive",
	"question",
	"objection",
	"not_interested",
	"opt_out",
	"human_request",
	"complaint",
	"unknown",
];

function persistedDecision(
	decision: InternalRecoveryDecision | null,
): ConversationDecision | null {
	if (!decision || decision.decisionType !== "conversation") return null;
	const [intentValue, stateValue] = decision.decision.split(":");
	if (!INTENTS.includes(intentValue as ConversationDecision["intent"]))
		return null;
	const state = conversationStateSchema.safeParse(stateValue);
	if (!state.success) return null;
	const evidence = asRecord(decision.evidence);
	const objectionValue = evidence.objection;
	const objection = ["budget", "timing", "contract", "customization"].includes(
		String(objectionValue),
	)
		? (objectionValue as ConversationDecision["objection"])
		: null;
	return {
		intent: intentValue as ConversationDecision["intent"],
		objection,
		state: state.data,
		shouldHandoff: evidence.should_handoff === true,
		recommendedAction: decision.shortReason,
	};
}

function mergeConversation(
	candidate: RecoveryCandidate,
	messages: InternalRecoveryMessage[],
): ConversationMessage[] {
	const all: ConversationMessage[] = [
		...candidate.conversation,
		...messages
			.filter((item) => item.channel === "whatsapp")
			.map((item) => ({
				direction: item.direction,
				text: item.content,
				timestamp: item.timestamp,
			})),
	];
	const seen = new Set<string>();
	return all
		.filter((item) => {
			const key = `${item.direction}:${item.timestamp}:${item.text}`;
			if (seen.has(key)) return false;
			seen.add(key);
			return true;
		})
		.sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
}

function latestMessage(
	conversation: ConversationMessage[],
	direction: ConversationMessage["direction"],
): ConversationMessage | null {
	return (
		[...conversation].reverse().find((item) => item.direction === direction) ??
		null
	);
}

function serviceWindowStatus(
	value: boolean | null,
): CopilotServiceWindowStatus {
	if (value === true) return "open";
	if (value === false) return "closed";
	return "unknown";
}

function resolveMatch(source: HubSpotSellerCopilotSource): CopilotResolveMatch {
	return {
		opportunityId: source.deal.dealId,
		contactId: source.identity.contactId,
		name: source.identity.name,
		company: source.identity.company,
		phone: source.identity.phone,
		email: source.identity.email,
		dealName: source.deal.dealName,
		stage: source.deal.stage,
		amount: source.deal.amount,
		score: source.candidate.recoveryScore,
	};
}

function timeline(
	source: HubSpotSellerCopilotSource,
	internal: InternalRevenueContext,
): SellerCopilotTimelineItem[] {
	const items: SellerCopilotTimelineItem[] = [];
	for (const activity of source.activities) {
		if (!activity.text) continue;
		items.push({
			id: `hubspot:${activity.id}`,
			type: activity.type,
			source: "hubspot",
			timestamp: activity.timestamp,
			summary: truncate(activity.text),
		});
	}
	for (const message of internal.messages) {
		items.push({
			id: `message:${message.id}`,
			type:
				message.direction === "inbound"
					? "mensagem_recebida"
					: "mensagem_enviada",
			source: message.channel === "whatsapp" ? "whatsapp" : "oplera",
			timestamp: message.timestamp,
			summary: truncate(message.content),
		});
	}
	for (const event of internal.events) {
		items.push({
			id: `event:${event.id}`,
			type: event.action,
			source: "oplera",
			timestamp: event.createdAt,
			summary: truncate(event.result || event.decision),
		});
	}
	if (internal.handoff) {
		items.push({
			id: `handoff:${internal.handoff.createdAt}`,
			type: "encaminhamento_humano",
			source: "oplera",
			timestamp: internal.handoff.createdAt,
			summary: internal.handoff.recommendedAction,
		});
	}
	for (const outbound of internal.pilotOutbound) {
		items.push({
			id: `pilot-outbound:${outbound.providerMessageId ?? outbound.createdAt}`,
			type: "provider_outbound",
			source: "whatsapp",
			timestamp: outbound.createdAt,
			summary: outbound.providerMessageId
				? `Mensagem aceita pelo WhatsApp (${outbound.providerMessageId}).`
				: `Operação de saída do WhatsApp: ${outbound.status}.`,
		});
	}
	for (const inbound of internal.pilotInbound) {
		items.push({
			id: `pilot-inbound:${inbound.externalMessageId}`,
			type: "provider_inbound",
			source: "whatsapp",
			timestamp: inbound.processedAt,
			summary: `Mensagem recebida processada pelo WhatsApp (${inbound.externalMessageId}).`,
		});
	}
	const seen = new Set<string>();
	return items
		.filter((item) => {
			const key = `${item.source}:${item.timestamp}:${item.summary}`;
			if (seen.has(key)) return false;
			seen.add(key);
			return true;
		})
		.sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))
		.slice(0, 20);
}

function signals(
	candidate: RecoveryCandidate,
	conversation: ConversationMessage[],
	decision: ConversationDecision | null,
	internal: InternalRevenueContext,
): string[] {
	const result: string[] = [];
	const inbound = latestMessage(conversation, "inbound");
	if (inbound) result.push(`WhatsApp recebido em ${inbound.timestamp}.`);
	if (candidate.signals.proposalSent) result.push("Proposta já enviada.");
	if (candidate.signals.explicitBuyingQuestion)
		result.push("Há pergunta explícita de compra no histórico.");
	if (decision?.objection === "budget")
		result.push("Objeção de orçamento identificada.");
	if (decision?.objection === "timing")
		result.push("Objeção de timing identificada.");
	if (decision?.intent === "positive")
		result.push("Intenção positiva identificada.");
	if (candidate.signals.sellerDropped)
		result.push("A conversa ficou sem continuidade do lado vendedor.");
	if (internal.nextTask)
		result.push(
			`Existe tarefa ${internal.nextTask.taskType.replaceAll("_", " ")} na fila.`,
		);
	if (internal.handoff) result.push("Existe encaminhamento humano aberto.");
	if (candidate.activeHumanConversation) result.push("Conversa humana ativa.");
	return [...new Set(result)].slice(0, 8);
}

export class RevenueContextService {
	constructor(
		private readonly hubspot: RevenueContextHubSpotProvider,
		private readonly internal: InternalRevenueContextReader,
		private readonly engine = new SellerCopilotEngine(),
		private readonly clock: () => Date = () => new Date(),
	) {}

	async resolve(input: CopilotResolveInput): Promise<CopilotResolveResult> {
		const matches = await this.hubspot.searchSellerCopilotSources(input);
		const normalized = matches.map(({ source }) => resolveMatch(source));
		if (!normalized.length) return { status: "not_found", matches: [] };
		const topScore = matches[0]?.score ?? 0;
		const top = matches.filter((item) => item.score === topScore);
		const resolved = top[0];
		if (top.length === 1 && topScore >= 70 && resolved) {
			const match = resolveMatch(resolved.source);
			return { status: "resolved", match, matches: normalized };
		}
		return { status: "ambiguous", matches: normalized };
	}

	async getContext(
		opportunityId: string,
		now = this.clock().toISOString(),
	): Promise<SellerCopilotContext> {
		const source = await this.hubspot.getSellerCopilotSource(opportunityId);
		if (!source) throw new Error("copilot_context_not_found");
		const internal = await this.internal.read(opportunityId);
		const candidate = source.candidate;
		const conversation = mergeConversation(candidate, internal.messages);
		const lastInbound = latestMessage(conversation, "inbound");
		const lastOutbound = latestMessage(conversation, "outbound");
		const storedDecision = persistedDecision(internal.latestDecision);
		const decision =
			storedDecision ??
			(lastInbound
				? decideConversationReply(
						candidate,
						lastInbound.text,
						defaultRecoveryPolicy,
					)
				: null);
		const window = resolveServiceWindow(conversation, new Date(now));
		const policy = evaluateRecoveryPolicy({
			policy: defaultRecoveryPolicy,
			action: "send_message",
			channel: "whatsapp",
			now,
			conversation,
			attempt: candidate.attempt,
			lastContactAt: lastOutbound?.timestamp,
			optedOut: candidate.optedOut,
			activeHumanConversation: candidate.activeHumanConversation,
			opportunityStatus: candidate.status,
			suppressed: candidate.status === "suppressed",
			messageMode: "free_form",
			providerSupportsApprovedTemplate: true,
		});
		const plan = planRecovery(
			candidate,
			defaultRecoveryPolicy.contact.maxAttempts,
		);
		const windowStatus = serviceWindowStatus(window.serviceWindowOpen);
		const nextBestAction = this.engine.decide({
			candidate,
			plan,
			policy,
			serviceWindowStatus: windowStatus,
			decision,
			latestInbound: lastInbound
				? { text: lastInbound.text, timestamp: lastInbound.timestamp }
				: null,
			latestOutbound: lastOutbound
				? { text: lastOutbound.text, timestamp: lastOutbound.timestamp }
				: null,
			nextTask: internal.nextTask,
			handoff: internal.handoff,
			now,
		});
		const whatsappFreshness =
			[
				lastInbound?.timestamp,
				lastOutbound?.timestamp,
				internal.pilotInbound[0]?.processedAt,
				internal.pilotOutbound[0]?.createdAt,
			]
				.filter((value): value is string => Boolean(value))
				.sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? null;
		const strategy = internal.session?.strategy ?? plan.strategy;

		return {
			identity: source.identity,
			deal: source.deal,
			recovery: {
				status: candidate.status,
				score: candidate.recoveryScore,
				reasonCode: candidate.reasonCode,
				attempt: candidate.attempt,
				strategy,
				nextTask: internal.nextTask?.taskType ?? null,
				dueAt: internal.nextTask?.dueAt ?? candidate.dueAt ?? null,
			},
			conversation: {
				lastInboundAt: lastInbound?.timestamp ?? null,
				lastOutboundAt: lastOutbound?.timestamp ?? null,
				lastInboundPreview: lastInbound
					? truncate(lastInbound.text, 240)
					: null,
				lastOutboundPreview: lastOutbound
					? truncate(lastOutbound.text, 240)
					: null,
				detectedIntent: decision?.intent ?? null,
				objection: decision?.objection ?? null,
				serviceWindowStatus: windowStatus,
				serviceWindowExpiresAt: window.serviceWindowExpiresAt ?? null,
			},
			policies: {
				result: policy.result,
				reasons: policy.reasons,
				requiresApproval: policy.result === "requires_approval",
			},
			signals: signals(candidate, conversation, decision, internal),
			timeline: timeline(source, internal),
			nextBestAction,
			freshness: {
				hubspot: source.fetchedAt,
				whatsapp: whatsappFreshness,
				oplera: internal.freshnessAt,
			},
			links: { hubspot: null },
		};
	}
}
