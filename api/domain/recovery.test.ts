import { describe, expect, test } from "bun:test";
import { parseConversationCsv } from "./csv.ts";
import {
	analyzeRecoveryPipeline,
	resolveServiceWindow,
	sampleConversations,
	type ConversationMessage,
} from "./recovery.ts";

const referenceDate = "2026-09-05T12:00:00.000Z";

function opportunityFromInbound(timestamp: string) {
	const result = analyzeRecoveryPipeline({
		conversations: [
			{
				id: "boundary-opportunity",
				contactName: "Ana Souza",
				estimatedValue: 5_000,
				messages: [
					{
						direction: "inbound",
						text: "Quero contratar. Qual o valor e como posso pagar?",
						timestamp,
					},
				],
			},
		],
		referenceDate,
	});

	expect(result.opportunities).toHaveLength(1);
	const opportunity = result.opportunities[0];
	expect(opportunity).toBeDefined();
	return opportunity!;
}

function serviceWindowFor(messages: ConversationMessage[]) {
	return resolveServiceWindow(messages, new Date(referenceDate));
}

describe("analyzeRecoveryPipeline", () => {
	test("prioritizes unanswered high-intent conversations", () => {
		const result = analyzeRecoveryPipeline({
			companyName: "Clínica Exemplo",
			conversations: sampleConversations(new Date(referenceDate)),
			referenceDate,
		});

		expect(result.summary.totalConversations).toBe(5);
		expect(result.summary.recoverableCount).toBe(3);
		expect(result.opportunities[0]?.priority).toBe("high");
		expect(result.opportunities[0]?.score).toBeGreaterThanOrEqual(75);
		expect(result.opportunities.some((item) => item.id === "opp-closed")).toBe(
			false,
		);
	});

	test("does not expose free-form recovery outside the service window", () => {
		const result = analyzeRecoveryPipeline({
			conversations: sampleConversations(new Date(referenceDate)),
			referenceDate,
		});

		expect(
			result.opportunities.every(
				(item) => item.deliveryMode === "approved_template_required",
			),
		).toBe(true);
	});

	test("keeps free-form open when the last inbound was 23h59 ago", () => {
		const opportunity = opportunityFromInbound("2026-09-04T12:01:00.000Z");

		expect(opportunity.deliveryMode).toBe("free_form");
		expect(opportunity.serviceWindowOpen).toBe(true);
		expect(opportunity.lastInboundMessageAt).toBe(
			"2026-09-04T12:01:00.000Z",
		);
	});

	test("keeps free-form open at exactly 24 hours", () => {
		const opportunity = opportunityFromInbound("2026-09-04T12:00:00.000Z");

		expect(opportunity.deliveryMode).toBe("free_form");
		expect(opportunity.serviceWindowOpen).toBe(true);
		expect(opportunity.serviceWindowExpiresAt).toBe(referenceDate);
	});

	test("requires an approved template after 24h01", () => {
		const opportunity = opportunityFromInbound("2026-09-04T11:59:00.000Z");

		expect(opportunity.deliveryMode).toBe("approved_template_required");
		expect(opportunity.serviceWindowOpen).toBe(false);
	});
});

describe("resolveServiceWindow", () => {
	test("uses the last inbound even when a newer outbound exists", () => {
		const result = serviceWindowFor([
			{
				direction: "inbound",
				text: "Tenho interesse, pode me mandar a proposta?",
				timestamp: "2026-09-04T10:00:00.000Z",
			},
			{
				direction: "outbound",
				text: "Acabei de reenviar a proposta.",
				timestamp: "2026-09-05T11:30:00.000Z",
			},
		]);

		expect(result.lastInboundMessageAt).toBe("2026-09-04T10:00:00.000Z");
		expect(result.deliveryMode).toBe("approved_template_required");
		expect(result.serviceWindowOpen).toBe(false);
	});

	test("uses a recent inbound even when the conversation started days earlier", () => {
		const result = serviceWindowFor([
			{
				direction: "inbound",
				text: "Queria entender os valores.",
				timestamp: "2026-08-29T10:00:00.000Z",
			},
			{
				direction: "outbound",
				text: "Segue a proposta.",
				timestamp: "2026-08-29T11:00:00.000Z",
			},
			{
				direction: "inbound",
				text: "Voltei. Ainda consigo fechar nessas condições?",
				timestamp: "2026-09-04T13:00:00.000Z",
			},
		]);

		expect(result.deliveryMode).toBe("free_form");
		expect(result.serviceWindowOpen).toBe(true);
		expect(result.lastInboundMessageAt).toBe("2026-09-04T13:00:00.000Z");
	});

	test("requires manual review when there is no usable inbound evidence", () => {
		const result = serviceWindowFor([
			{
				direction: "outbound",
				text: "Posso ajudar com alguma dúvida?",
				timestamp: "2026-09-04T15:00:00.000Z",
			},
		]);

		expect(result.deliveryMode).toBe("manual_review");
		expect(result.serviceWindowOpen).toBeNull();
		expect(result.lastInboundMessageAt).toBeUndefined();
		expect(result.serviceWindowExpiresAt).toBeUndefined();
	});
});

describe("parseConversationCsv", () => {
	test("groups messages belonging to the same conversation", () => {
		const csv = `conversation_id,contact_name,phone,owner,source,estimated_value,direction,message,timestamp
1,Ana,5521999,Bia,Meta Ads,3500,inbound,"Quanto custa, por favor?",2026-09-01T10:00:00.000Z
1,Ana,5521999,Bia,Meta Ads,3500,outbound,"O valor é R$ 3.500",2026-09-01T10:05:00.000Z`;

		const conversations = parseConversationCsv(csv);
		expect(conversations).toHaveLength(1);
		expect(conversations[0]?.messages).toHaveLength(2);
		expect(conversations[0]?.estimatedValue).toBe(3500);
	});
});
