import { describe, expect, test } from "bun:test";
import { parseConversationCsv } from "./csv.ts";
import { analyzeRecoveryPipeline, sampleConversations } from "./recovery.ts";

const referenceDate = "2026-09-05T12:00:00.000Z";

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
