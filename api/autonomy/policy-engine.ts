import type { ConversationMessage } from "../domain/recovery.ts";
import { resolveServiceWindow } from "../domain/recovery.ts";
import type {
	MessageMode,
	PolicyDecision,
	RecoveryChannel,
	RecoveryPolicy,
	RecoveryStatus,
} from "./types.ts";

export const defaultRecoveryPolicy: RecoveryPolicy = {
	contact: {
		maxAttempts: 3,
		minimumIntervalHours: 24,
		allowedHours: { start: 9, end: 18 },
		allowedWeekdays: [1, 2, 3, 4, 5],
		timeZone: "America/Sao_Paulo",
		suppressOnOptOut: true,
		suppressIfActiveHumanConversation: true,
	},
	commercial: {
		aiMayMentionPricing: false,
		maxAutonomousDiscountPercent: 0,
		allowedPaymentConditions: ["existing_crm_terms"],
		customProposalRequiresHuman: true,
	},
	handoff: {
		highIntentToHuman: true,
		complaintToHuman: true,
		legalOrContractToHuman: true,
		unknownCustomizationToHuman: true,
		lowEvidenceToHuman: true,
	},
};

type PolicyAction =
	| "send_message"
	| "mention_pricing"
	| "apply_discount"
	| "custom_proposal"
	| "book_meeting";

export interface PolicyInput {
	policy: RecoveryPolicy;
	action: PolicyAction;
	channel: RecoveryChannel;
	now: string;
	conversation: ConversationMessage[];
	attempt: number;
	lastContactAt?: string;
	optedOut: boolean;
	activeHumanConversation: boolean;
	opportunityStatus: RecoveryStatus;
	suppressed: boolean;
	messageMode?: MessageMode;
	providerSupportsApprovedTemplate?: boolean;
	requestedDiscountPercent?: number;
}

function localClock(
	date: Date,
	timeZone: string,
): { weekday: number; hour: number } {
	const weekdayName = new Intl.DateTimeFormat("en-US", {
		timeZone,
		weekday: "short",
	}).format(date);
	const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(
		weekdayName,
	);
	const hourText = new Intl.DateTimeFormat("en-US", {
		timeZone,
		hour: "2-digit",
		hourCycle: "h23",
	}).format(date);
	return { weekday, hour: Number.parseInt(hourText, 10) };
}

function block(reason: string): PolicyDecision {
	return { result: "blocked", reasons: [reason] };
}

function approval(
	reason: string,
	extra: Partial<PolicyDecision> = {},
): PolicyDecision {
	return { result: "requires_approval", reasons: [reason], ...extra };
}

export function evaluateRecoveryPolicy(input: PolicyInput): PolicyDecision {
	const now = new Date(input.now);
	if (Number.isNaN(now.getTime())) return block("invalid_reference_time");

	if (input.policy.contact.suppressOnOptOut && input.optedOut) {
		return block("opt_out");
	}
	if (input.suppressed || input.opportunityStatus === "suppressed") {
		return block("suppressed");
	}
	if (
		input.policy.contact.suppressIfActiveHumanConversation &&
		input.activeHumanConversation
	) {
		return block("active_human_conversation");
	}
	if (input.attempt >= input.policy.contact.maxAttempts) {
		return block("max_attempts");
	}

	const clock = localClock(now, input.policy.contact.timeZone);
	if (!input.policy.contact.allowedWeekdays.includes(clock.weekday)) {
		return block("blocked_by_weekday");
	}
	if (
		clock.hour < input.policy.contact.allowedHours.start ||
		clock.hour >= input.policy.contact.allowedHours.end
	) {
		return block("blocked_by_hours");
	}

	if (input.lastContactAt) {
		const lastContact = Date.parse(input.lastContactAt);
		if (!Number.isNaN(lastContact)) {
			const minimumIntervalMs =
				input.policy.contact.minimumIntervalHours * 60 * 60 * 1_000;
			if (now.getTime() - lastContact < minimumIntervalMs) {
				return {
					result: "blocked",
					reasons: ["minimum_interval"],
					nextEligibleAt: new Date(
						lastContact + minimumIntervalMs,
					).toISOString(),
				};
			}
		}
	}

	if (
		input.action === "mention_pricing" &&
		!input.policy.commercial.aiMayMentionPricing
	) {
		return approval("pricing_requires_approval");
	}
	if (
		input.action === "custom_proposal" &&
		input.policy.commercial.customProposalRequiresHuman
	) {
		return approval("custom_proposal_requires_approval");
	}
	if (
		input.action === "apply_discount" &&
		(input.requestedDiscountPercent ?? 0) >
			input.policy.commercial.maxAutonomousDiscountPercent
	) {
		return approval("discount_outside_autonomous_limit");
	}

	if (input.action === "send_message" && input.channel === "whatsapp") {
		const serviceWindow = resolveServiceWindow(input.conversation, now);
		const base = {
			serviceWindowOpen: serviceWindow.serviceWindowOpen,
			serviceWindowExpiresAt: serviceWindow.serviceWindowExpiresAt,
		};

		if (serviceWindow.serviceWindowOpen === true) {
			return { result: "allowed", reasons: ["policy_passed"], ...base };
		}

		if (
			serviceWindow.serviceWindowOpen === false &&
			input.messageMode === "approved_template" &&
			input.providerSupportsApprovedTemplate === true
		) {
			return {
				result: "allowed",
				reasons: ["approved_template_outside_service_window"],
				...base,
			};
		}

		return approval(
			serviceWindow.serviceWindowOpen === false
				? "whatsapp_service_window_closed"
				: "whatsapp_service_window_unknown",
			base,
		);
	}

	return { result: "allowed", reasons: ["policy_passed"] };
}
