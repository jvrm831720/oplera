import { describe, expect, test } from "bun:test";
import { createHmac } from "node:crypto";
import { PilotStateStore } from "./state-store.ts";
import { jsonResponse, pilotTestConfig } from "./test-fixtures.ts";
import { parseWhatsAppWebhook, WhatsAppCloudProvider } from "./whatsapp.ts";

describe("WhatsApp Cloud provider", () => {
	test("dry-run never calls the network and is idempotent", async () => {
		let calls = 0;
		const fetcher = Object.assign(
			async () => {
				calls += 1;
				return jsonResponse({ messages: [{ id: "should-not-send" }] });
			},
			{ preconnect: fetch.preconnect },
		);
		const provider = new WhatsAppCloudProvider(
			pilotTestConfig(),
			new PilotStateStore(":memory:"),
			async () => "+5511999999999",
			fetcher,
		);
		const input = {
			idempotencyKey: "same-key",
			opportunityId: "100",
			channel: "whatsapp" as const,
			text: "Teste",
			mode: "free_form" as const,
		};
		const first = await provider.sendMessage(input);
		const second = await provider.sendMessage(input);
		expect(first.providerMessageId).toBe("dry-run:same-key");
		expect(second).toEqual(first);
		expect(calls).toBe(0);
	});

	test("kill switch blocks live network calls", async () => {
		const config = pilotTestConfig({
			PILOT_DRY_RUN: "false",
			PILOT_KILL_SWITCH: "true",
		});
		const provider = new WhatsAppCloudProvider(
			config,
			new PilotStateStore(":memory:"),
			async () => "+5511999999999",
		);
		await expect(
			provider.sendMessage({
				idempotencyKey: "blocked",
				opportunityId: "100",
				channel: "whatsapp",
				text: "Teste",
				mode: "free_form",
			}),
		).rejects.toThrow("pilot_kill_switch_enabled");
	});

	test("rejects a recipient outside the phone allowlist", async () => {
		const provider = new WhatsAppCloudProvider(
			pilotTestConfig(),
			new PilotStateStore(":memory:"),
			async () => "+5511888888888",
		);
		await expect(
			provider.sendMessage({
				idempotencyKey: "not-allowed",
				opportunityId: "100",
				channel: "whatsapp",
				text: "Teste",
				mode: "free_form",
			}),
		).rejects.toThrow("pilot_phone_not_allowlisted");
	});

	test("verifies webhook signature and extracts text messages", () => {
		const config = pilotTestConfig();
		const provider = new WhatsAppCloudProvider(
			config,
			new PilotStateStore(":memory:"),
			async () => "+5511999999999",
		);
		const body = JSON.stringify({
			entry: [
				{
					changes: [
						{
							value: {
								messages: [
									{
										id: "wamid.1",
										from: "5511999999999",
										timestamp: "1788793200",
										type: "text",
										text: { body: "Tenho interesse" },
									},
								],
							},
						},
					],
				},
			],
		});
		const signature = `sha256=${createHmac("sha256", config.WHATSAPP_APP_SECRET)
			.update(body)
			.digest("hex")}`;
		expect(provider.verifyWebhookSignature(body, signature)).toBe(true);
		expect(parseWhatsAppWebhook(body)).toMatchObject([
			{ id: "wamid.1", from: "+5511999999999", text: "Tenho interesse" },
		]);
	});
});
