import { describe, expect, test } from "bun:test";
import { scoreRecoveryCandidate } from "./scoring.ts";
import type { RecoverySignals } from "./types.ts";

const baseSignals: RecoverySignals = {
	previousEngagement: false,
	proposalSent: false,
	explicitBuyingQuestion: false,
	knownObjection: false,
	sellerDropped: false,
	lostReason: "none",
};

describe("recovery scoring", () => {
	test("prioritizes a ghosted proposal reproducibly", () => {
		const input = {
			amount: 18_000,
			daysInactive: 9,
			signals: {
				...baseSignals,
				previousEngagement: true,
				proposalSent: true,
				explicitBuyingQuestion: true,
			},
			optedOut: false,
			activeHumanConversation: false,
		};
		const first = scoreRecoveryCandidate(input);
		const second = scoreRecoveryCandidate(input);
		expect(first).toEqual(second);
		expect(first.reasonCode).toBe("proposal_ghosted");
		expect(first.recoverable).toBe(true);
		expect(first.score).toBeGreaterThanOrEqual(70);
	});

	test("recognizes seller dropped context", () => {
		const result = scoreRecoveryCandidate({
			amount: 8_500,
			daysInactive: 12,
			signals: {
				...baseSignals,
				previousEngagement: true,
				explicitBuyingQuestion: true,
				sellerDropped: true,
			},
			optedOut: false,
			activeHumanConversation: false,
		});
		expect(result.reasonCode).toBe("seller_dropped");
		expect(result.recoverable).toBe(true);
	});

	test("keeps stale low intent below high priority", () => {
		const result = scoreRecoveryCandidate({
			amount: 400,
			daysInactive: 140,
			signals: baseSignals,
			optedOut: false,
			activeHumanConversation: false,
		});
		expect(result.reasonCode).toBe("stale_low_intent");
		expect(result.recoverable).toBe(false);
		expect(result.score).toBeLessThan(35);
	});

	test("forces opt-out to zero regardless of commercial signals", () => {
		const result = scoreRecoveryCandidate({
			amount: 100_000,
			daysInactive: 2,
			signals: {
				...baseSignals,
				previousEngagement: true,
				proposalSent: true,
				explicitBuyingQuestion: true,
			},
			optedOut: true,
			activeHumanConversation: false,
			semanticContribution: 999,
		});
		expect(result.recoverable).toBe(false);
		expect(result.score).toBe(0);
	});

	test("caps semantic contribution at five points", () => {
		const shared = {
			amount: 4_000,
			daysInactive: 20,
			signals: baseSignals,
			optedOut: false,
			activeHumanConversation: false,
		};
		const capped = scoreRecoveryCandidate({ ...shared, semanticContribution: 999 });
		const explicitFive = scoreRecoveryCandidate({ ...shared, semanticContribution: 5 });
		expect(capped.score).toBe(explicitFive.score);
	});
});
