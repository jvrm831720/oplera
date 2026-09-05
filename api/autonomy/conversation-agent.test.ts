import { describe, expect, test } from "bun:test";
import { decideConversationReply } from "./conversation-agent.ts";
import { demoCandidates } from "./demo.ts";
import { defaultRecoveryPolicy } from "./policy-engine.ts";

const candidate = demoCandidates(new Date("2026-09-05T15:00:00.000Z"))[0];
if (!candidate) throw new Error("demo candidate missing");

describe("conversation agent", () => {
	test("hands off positive high-intent replies", () => {
		const decision = decideConversationReply(
			candidate,
			"Quero fechar, como pago?",
			defaultRecoveryPolicy,
		);
		expect(decision.intent).toBe("positive");
		expect(decision.shouldHandoff).toBe(true);
		expect(decision.handoffReason).toBe("high_intent");
	});

	test("handles budget objection without inventing a discount", () => {
		const decision = decideConversationReply(
			candidate,
			"Está caro, vocês conseguem desconto?",
			defaultRecoveryPolicy,
		);
		expect(decision.intent).toBe("objection");
		expect(decision.objection).toBe("budget");
		expect(decision.draftReply).toContain("sem inventar desconto ou prazo");
	});

	test("closes no-interest replies", () => {
		const decision = decideConversationReply(
			candidate,
			"Não tenho interesse, obrigado.",
			defaultRecoveryPolicy,
		);
		expect(decision.intent).toBe("not_interested");
		expect(decision.state).toBe("closed");
	});

	test("detects opt-out before continuing", () => {
		const decision = decideConversationReply(
			candidate,
			"Pare de me mandar mensagens.",
			defaultRecoveryPolicy,
		);
		expect(decision.intent).toBe("opt_out");
		expect(decision.recommendedAction).toContain("Suppress contact");
	});

	test("honors an explicit human request", () => {
		const decision = decideConversationReply(
			candidate,
			"Quero falar com um vendedor humano.",
			defaultRecoveryPolicy,
		);
		expect(decision.shouldHandoff).toBe(true);
		expect(decision.handoffReason).toBe("customer_requested_human");
	});

	test("hands contract questions to a human", () => {
		const decision = decideConversationReply(
			candidate,
			"Pode alterar essa cláusula do contrato?",
			defaultRecoveryPolicy,
		);
		expect(decision.shouldHandoff).toBe(true);
		expect(decision.handoffReason).toBe("legal_or_contract");
	});
});
