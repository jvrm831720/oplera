import type {
	PolicyDecision,
	RecoveryReasonCode,
	RecoveryStatus,
} from "../autonomy/types.ts";
import type { ConversationDecision } from "../autonomy/conversation-agent.ts";

export type CopilotUrgency = "low" | "medium" | "high" | "critical";
export type CopilotTimelineSource = "hubspot" | "whatsapp" | "oplera";
export type CopilotServiceWindowStatus = "open" | "closed" | "unknown";

export interface SellerCopilotTimelineItem {
	id: string;
	type: string;
	source: CopilotTimelineSource;
	timestamp: string;
	summary: string;
}

export interface SellerCopilotNextBestAction {
	type:
		| "do_not_contact"
		| "manual_handoff"
		| "reply_now"
		| "advance_stage"
		| "budget_recheck"
		| "timing_confirm"
		| "proposal_followup"
		| "due_recovery_task"
		| "active_human"
		| "review_opportunity";
	title: string;
	description: string;
	urgency: CopilotUrgency;
	why: string;
	evidence: string[];
	policyResult: PolicyDecision["result"];
	requiresApproval: boolean;
	suggestedMessage?: string;
}

export interface SellerCopilotContext {
	identity: {
		contactId: string | null;
		name: string;
		phone: string | null;
		email: string | null;
		role: string | null;
		companyId: string | null;
		company: string;
	};
	deal: {
		dealId: string;
		dealName: string;
		stage: string;
		amount: number;
		currency: string;
		owner: string;
		lastActivityAt: string;
	};
	recovery: {
		status: RecoveryStatus;
		score: number;
		reasonCode: RecoveryReasonCode;
		attempt: number;
		strategy: string;
		nextTask: string | null;
		dueAt: string | null;
	};
	conversation: {
		lastInboundAt: string | null;
		lastOutboundAt: string | null;
		lastInboundPreview: string | null;
		lastOutboundPreview: string | null;
		detectedIntent: ConversationDecision["intent"] | null;
		objection: ConversationDecision["objection"];
		serviceWindowStatus: CopilotServiceWindowStatus;
		serviceWindowExpiresAt: string | null;
	};
	policies: {
		result: PolicyDecision["result"];
		reasons: string[];
		requiresApproval: boolean;
	};
	signals: string[];
	timeline: SellerCopilotTimelineItem[];
	nextBestAction: SellerCopilotNextBestAction;
	freshness: {
		hubspot: string;
		whatsapp: string | null;
		oplera: string | null;
	};
	links: {
		hubspot: string | null;
	};
}

export interface CopilotResolveInput {
	phone?: string;
	name?: string;
	email?: string;
	company?: string;
	query?: string;
}

export interface CopilotResolveMatch {
	opportunityId: string;
	contactId: string | null;
	name: string;
	company: string;
	phone: string | null;
	email: string | null;
	dealName: string;
	stage: string;
	amount: number;
	score: number;
}

export type CopilotResolveResult =
	| { status: "resolved"; match: CopilotResolveMatch; matches: CopilotResolveMatch[] }
	| { status: "ambiguous"; matches: CopilotResolveMatch[] }
	| { status: "not_found"; matches: [] };
