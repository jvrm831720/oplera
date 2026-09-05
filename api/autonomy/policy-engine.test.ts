import { describe, expect, test } from "bun:test";
import type { ConversationMessage } from "../domain/recovery.ts";
import {
	defaultRecoveryPolicy,
	evaluateRecoveryPolicy,
} from "./policy-engine.ts";

const MONDAY_NOON = "2026-09-07T15:00:00.000Z";

function conversation(lastInboundAt: string): ConversationMessage[] {
	return [
		{
			direction: "inbound",
			text: "Tenho interesse, pode me explicar o próximo passo?",
			timestamp: lastInboundAt,
		},
	];
}

function input(
	overrides: Partial<Parameters<typeof evaluateRecoveryPolicy>[0]> = {},
) {
	return {
		policy: defaultRecoveryPolicy,
		action: "send_message" as const,
		channel: "email" as const,
		now: MONDAY_NOON,
		conversation: conversation("2026-09-07T14:00:00.000Z"),
		attempt: 0,
		optedOut: false,
		activeHumanConversation: false,
		opportunityStatus: "planned" as const,
		suppressed: false,
		...overrides,
	};
}

describe("policy engine", () => {
	test("allows a valid email action", () => {
		expect(evaluateRecoveryPolicy(input()).result).toBe("allowed");
	});

	test("blocks outside configured contact hours", () => {
		const decision = evaluateRecoveryPolicy(
			input({ now: "2026-09-07T02:00:00.000Z" }),
		);
		expect(decision).toMatchObject({
			result: "blocked",
			reasons: ["blocked_by_hours"],
		});
	});

	test("blocks opt-out", () => {
		const decision = evaluateRecoveryPolicy(input({ optedOut: true }));
		expect(decision).toMatchObject({ result: "blocked", reasons: ["opt_out"] });
	});

	test("blocks after max attempts", () => {
		const decision = evaluateRecoveryPolicy(
			input({ attempt: defaultRecoveryPolicy.contact.maxAttempts }),
		);
		expect(decision.reasons).toContain("max_attempts");
	});

	test("blocks when a human conversation is active", () => {
		const decision = evaluateRecoveryPolicy(
			input({ activeHumanConversation: true }),
		);
		expect(decision.reasons).toContain("active_human_conversation");
	});

	test("requires approval for an autonomous custom proposal", () => {
		const decision = evaluateRecoveryPolicy(
			input({ action: "custom_proposal" }),
		);
		expect(decision).toMatchObject({
			result: "requires_approval",
			reasons: ["custom_proposal_requires_approval"],
		});
	});

	test("reuses the existing 24h WhatsApp service window", () => {
		const decision = evaluateRecoveryPolicy(
			input({
				channel: "whatsapp",
				conversation: conversation("2026-09-06T15:00:00.000Z"),
			}),
		);
		expect(decision.result).toBe("allowed");
		expect(decision.serviceWindowOpen).toBe(true);
	});

	test("does not allow free-form WhatsApp after the 24h boundary", () => {
		const decision = evaluateRecoveryPolicy(
			input({
				channel: "whatsapp",
				conversation: conversation("2026-09-06T14:59:59.999Z"),
			}),
		);
		expect(decision.result).toBe("requires_approval");
		expect(decision.reasons).toContain("whatsapp_service_window_closed");
	});

	test("allows only an explicitly supported approved template outside the window", () => {
		const decision = evaluateRecoveryPolicy(
			input({
				channel: "whatsapp",
				conversation: conversation("2026-09-01T15:00:00.000Z"),
				messageMode: "approved_template",
				providerSupportsApprovedTemplate: true,
			}),
		);
		expect(decision).toMatchObject({
			result: "allowed",
			reasons: ["approved_template_outside_service_window"],
			serviceWindowOpen: false,
		});
	});
});
