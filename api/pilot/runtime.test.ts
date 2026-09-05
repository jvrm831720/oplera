import { describe, expect, test } from "bun:test";
import { HubSpotCRMProvider } from "./hubspot.ts";
import { PilotRuntime } from "./runtime.ts";
import { PilotStateStore } from "./state-store.ts";
import {
	hubSpotFixtureFetch,
	jsonResponse,
	pilotTestConfig,
} from "./test-fixtures.ts";
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

	test("executes the live pilot chain once and writes the reply back to HubSpot", async () => {
		const config = pilotTestConfig({
			PILOT_DRY_RUN: "false",
			PILOT_KILL_SWITCH: "false",
		});
		const rawHubspotFetch = hubSpotFixtureFetch();
		const hubspotRequests: Array<{
			method: string;
			url: string;
			body: string;
		}> = [];
		const hubspotFetch = Object.assign(
			async (input: RequestInfo | URL, init?: RequestInit) => {
				const url =
					typeof input === "string"
						? input
						: input instanceof URL
							? input.toString()
							: input.url;
				hubspotRequests.push({
					method: init?.method ?? "GET",
					url,
					body: typeof init?.body === "string" ? init.body : "",
				});
				return rawHubspotFetch(input, init);
			},
			{ preconnect: fetch.preconnect },
		);
		const hubspot = new HubSpotCRMProvider(
			config,
			hubspotFetch,
			() => new Date("2026-09-07T15:00:00.000Z"),
		);
		const state = new PilotStateStore(":memory:");
		let whatsappNetworkCalls = 0;
		const whatsappFetch = Object.assign(
			async () => {
				whatsappNetworkCalls += 1;
				return jsonResponse({ messages: [{ id: "wamid.outbound.1" }] });
			},
			{ preconnect: fetch.preconnect },
		);
		const whatsapp = new WhatsAppCloudProvider(
			config,
			state,
			(id) => hubspot.resolveMessagingRecipient(id),
			whatsappFetch,
		);
		const runtime = new PilotRuntime(config, state, hubspot, whatsapp);
		const now = "2026-09-07T15:00:00.000Z";

		await runtime.approve("100", "pilot-operator@example.com", now);
		const outbound = await runtime.execute("100", now);
		expect(outbound.status).toBe("sent");
		if (outbound.status !== "sent") throw new Error("expected_live_send");
		expect(outbound.provider.providerMessageId).toBe("wamid.outbound.1");
		expect(whatsappNetworkCalls).toBe(1);
		expect(
			hubspotRequests.some(
				(item) =>
					item.method === "PATCH" &&
					item.url.includes("/crm/v3/objects/deals/100") &&
					item.body.includes("awaiting_reply"),
			),
		).toBe(true);
		expect(
			hubspotRequests.filter(
				(item) =>
					item.method === "POST" &&
					item.url.endsWith("/crm/v3/objects/notes"),
			).length,
		).toBeGreaterThanOrEqual(2);

		await whatsapp.sendApprovedTemplate({
			idempotencyKey: outbound.idempotencyKey,
			opportunityId: "100",
			contactName: "Marina Silva",
		});
		expect(whatsappNetworkCalls).toBe(1);

		const beforeInbound = hubspotRequests.length;
		const inbound = {
			id: "wamid.inbound.1",
			from: "+5511999999999",
			timestamp: "2026-09-07T15:05:00.000Z",
			text: "O orçamento ainda é o principal ponto.",
		};
		const observed = await runtime.handleIncoming(inbound);
		expect(observed.status).toBe("processed");
		if (observed.status !== "processed") throw new Error("expected_processed_reply");
		expect(observed.decision.intent).toBe("objection");
		expect(observed.decision.objection).toBe("budget");
		expect(
			hubspotRequests.some(
				(item) =>
					item.method === "PATCH" &&
					item.url.includes("/crm/v3/objects/deals/100") &&
					item.body.includes("engaged"),
			),
		).toBe(true);
		expect(
			hubspotRequests.some(
				(item) =>
					item.method === "POST" &&
					item.url.endsWith("/crm/v3/objects/notes") &&
					item.body.includes("OPLERA_INBOUND"),
			),
		).toBe(true);

		const duplicate = await runtime.handleIncoming(inbound);
		expect(duplicate.status).toBe("duplicate");
		expect(hubspotRequests.length).toBeGreaterThan(beforeInbound);
		const afterFirstInbound = hubspotRequests.length;
		await runtime.handleIncoming(inbound);
		expect(hubspotRequests.length).toBe(afterFirstInbound);
	});
});
