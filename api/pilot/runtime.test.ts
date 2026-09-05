import { describe, expect, test } from "bun:test";
import { HubSpotCRMProvider } from "./hubspot.ts";
import { PilotRuntime } from "./runtime.ts";
import { PilotStateStore } from "./state-store.ts";
import { hubSpotFixtureFetch, pilotTestConfig } from "./test-fixtures.ts";
import { WhatsAppCloudProvider } from "./whatsapp.ts";

describe("live pilot runtime", () => {
	test("requires human approval before first contact and remains side-effect free in dry-run", async () => {
		const config = pilotTestConfig();
		const hubspotCalls: string[] = [];
		const hubspot = new HubSpotCRMProvider(
			config,
			hubSpotFixtureFetch(hubspotCalls),
			() => new Date("2026-09-07T15:00:00.000Z"),
		);
		const state = new PilotStateStore(":memory:");
		const whatsapp = new WhatsAppCloudProvider(config, state, (id) =>
			hubspot.resolveMessagingRecipient(id),
		);
		const runtime = new PilotRuntime(config, state, hubspot, whatsapp);
		const now = "2026-09-07T15:00:00.000Z";

		const preview = await runtime.preview("100", now);
		expect(preview.messageMode).toBe("approved_template");
		expect(preview.requiresHumanApproval).toBe(true);
		await expect(runtime.execute("100", now)).rejects.toThrow(
			"pilot_first_contact_approval_required",
		);

		await runtime.approve("100", "pilot-operator@example.com", now);
		const result = await runtime.execute("100", now);
		expect(result.status).toBe("dry_run");
		expect(result.writeback).toBe(false);
		expect(hubspotCalls.some((item) => item.startsWith("PATCH "))).toBe(false);
	});
});
