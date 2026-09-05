import { describe, expect, test } from "bun:test";
import { HubSpotCRMProvider } from "./hubspot.ts";
import { hubSpotFixtureFetch, pilotTestConfig } from "./test-fixtures.ts";

describe("HubSpot CRM provider", () => {
	test("imports allowlisted deal, contact, company and activities into recovery context", async () => {
		const provider = new HubSpotCRMProvider(
			pilotTestConfig(),
			hubSpotFixtureFetch(),
			() => new Date("2026-09-07T15:00:00.000Z"),
		);
		const candidate = await provider.getOpportunityContext("100");
		expect(candidate?.crmId).toBe("100");
		expect(candidate?.contactName).toBe("Marina Silva");
		expect(candidate?.company).toBe("ACME");
		expect(candidate?.signals.proposalSent).toBe(true);
		expect(candidate?.signals.lostReason).toBe("timing");
		expect(candidate?.recoveryScore).toBeGreaterThan(35);
		expect(candidate?.channel).toBe("whatsapp");
	});

	test("rejects a deal outside the pilot allowlist", async () => {
		const provider = new HubSpotCRMProvider(pilotTestConfig(), hubSpotFixtureFetch());
		await expect(provider.getOpportunityContext("999")).rejects.toThrow("pilot_deal_not_allowlisted");
	});

	test("writes recovery status and activity back to HubSpot", async () => {
		const calls: string[] = [];
		const provider = new HubSpotCRMProvider(pilotTestConfig(), hubSpotFixtureFetch(calls));
		await provider.updateOpportunity("100", "awaiting_reply");
		await provider.createActivity("100", "pilot activity");
		expect(calls.some((item) => item.startsWith("PATCH ") && item.includes("/deals/100"))).toBe(true);
		expect(calls.some((item) => item.startsWith("POST ") && item.endsWith("/crm/v3/objects/notes"))).toBe(true);
	});
});
