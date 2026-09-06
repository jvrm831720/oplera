import { createHmac, timingSafeEqual } from "node:crypto";
import type {
	MessagingProvider,
	SendMessageInput,
	SendMessageResult,
} from "../autonomy/providers.ts";
import { normalizePhone, type PilotConfig } from "./config.ts";
import { pilotLog } from "./logger.ts";
import type { PilotStateStoreLike } from "./state-store.ts";

type FetchLike = typeof fetch;

export interface WhatsAppInboundMessage {
	id: string;
	from: string;
	timestamp: string;
	text: string;
}

export class WhatsAppCloudProvider implements MessagingProvider {
	constructor(
		private readonly config: PilotConfig,
		private readonly state: PilotStateStoreLike,
		private readonly recipientResolver: (
			opportunityId: string,
		) => Promise<string>,
		private readonly fetcher: FetchLike = fetch,
	) {}

	async sendMessage(input: SendMessageInput): Promise<SendMessageResult> {
		if (input.channel !== "whatsapp")
			throw new Error("pilot_provider_only_supports_whatsapp");
		const recipient = await this.resolveAllowedRecipient(input.opportunityId);
		return this.sendWithIdempotency(
			input.idempotencyKey,
			input.opportunityId,
			recipient,
			{
				messaging_product: "whatsapp",
				to: recipient,
				type: "text",
				text: { body: input.text, preview_url: false },
			},
		);
	}

	async sendApprovedTemplate(input: {
		idempotencyKey: string;
		opportunityId: string;
		contactName: string;
	}): Promise<SendMessageResult> {
		const recipient = await this.resolveAllowedRecipient(input.opportunityId);
		const firstName =
			input.contactName.trim().split(/\s+/)[0] || input.contactName;
		return this.sendWithIdempotency(
			input.idempotencyKey,
			input.opportunityId,
			recipient,
			{
				messaging_product: "whatsapp",
				to: recipient,
				type: "template",
				template: {
					name: this.config.WHATSAPP_TEMPLATE_NAME,
					language: { code: this.config.WHATSAPP_TEMPLATE_LANGUAGE },
					components: [
						{
							type: "body",
							parameters: [{ type: "text", text: firstName }],
						},
					],
				},
			},
		);
	}

	verifyWebhookSignature(rawBody: string, signature: string | null): boolean {
		if (!signature?.startsWith("sha256=")) return false;
		const expected = `sha256=${createHmac(
			"sha256",
			this.config.WHATSAPP_APP_SECRET,
		)
			.update(rawBody)
			.digest("hex")}`;
		const actualBuffer = Buffer.from(signature);
		const expectedBuffer = Buffer.from(expected);
		return (
			actualBuffer.length === expectedBuffer.length &&
			timingSafeEqual(actualBuffer, expectedBuffer)
		);
	}

	verifyWebhookChallenge(url: URL): string | null {
		if (
			url.searchParams.get("hub.mode") === "subscribe" &&
			url.searchParams.get("hub.verify_token") ===
				this.config.WHATSAPP_VERIFY_TOKEN
		) {
			return url.searchParams.get("hub.challenge");
		}
		return null;
	}

	private async resolveAllowedRecipient(
		opportunityId: string,
	): Promise<string> {
		const recipient = normalizePhone(
			await this.recipientResolver(opportunityId),
		);
		const allowlist = this.config.PILOT_PHONE_ALLOWLIST.map(normalizePhone);
		if (!recipient || !allowlist.includes(recipient))
			throw new Error("pilot_phone_not_allowlisted");
		return recipient;
	}

	private async sendWithIdempotency(
		key: string,
		opportunityId: string,
		recipient: string,
		body: Record<string, unknown>,
	): Promise<SendMessageResult> {
		const existing = await this.state.getOutbound(key);
		if (existing) return existing;
		const now = new Date().toISOString();
		const reservation = await this.state.reserveOutbound(
			key,
			opportunityId,
			"whatsapp_cloud_api",
			{
				recipient,
				message_type: typeof body.type === "string" ? body.type : "unknown",
			},
			now,
		);
		if (!reservation.acquired) {
			if (reservation.result) return reservation.result;
			if (reservation.status === "uncertain")
				throw new Error("pilot_outbound_delivery_uncertain");
			throw new Error("pilot_outbound_operation_in_progress");
		}

		if (this.config.PILOT_DRY_RUN) {
			const result = { providerMessageId: `dry-run:${key}`, accepted: true };
			await this.state.putOutbound(key, result, now);
			pilotLog("info", "whatsapp_dry_run", { idempotency_key: key, recipient });
			return result;
		}
		if (this.config.PILOT_KILL_SWITCH) {
			await this.state.releaseOutbound(key);
			throw new Error("pilot_kill_switch_enabled");
		}

		let response: Response;
		try {
			response = await this.fetcher(
				`https://graph.facebook.com/${this.config.WHATSAPP_GRAPH_VERSION}/${encodeURIComponent(
					this.config.WHATSAPP_PHONE_NUMBER_ID,
				)}/messages`,
				{
					method: "POST",
					headers: {
						accept: "application/json",
						"content-type": "application/json",
						authorization: `Bearer ${this.config.WHATSAPP_ACCESS_TOKEN}`,
					},
					body: JSON.stringify(body),
					signal: AbortSignal.timeout(15_000),
				},
			);
		} catch (error) {
			await this.state.markOutboundUncertain(key, new Date().toISOString());
			pilotLog("error", "whatsapp_send_uncertain", {
				idempotency_key: key,
				error: error instanceof Error ? error.message : "network_error",
			});
			throw error;
		}
		const text = await response.text();
		if (!response.ok) {
			await this.state.releaseOutbound(key);
			pilotLog("error", "whatsapp_send_failed", {
				status: response.status,
				idempotency_key: key,
				body: text.slice(0, 500),
			});
			throw new Error(`whatsapp_http_${response.status}`);
		}
		const parsed = (text ? JSON.parse(text) : {}) as {
			messages?: Array<{ id?: string }>;
		};
		const providerMessageId = parsed.messages?.[0]?.id;
		if (!providerMessageId) {
			await this.state.markOutboundUncertain(key, new Date().toISOString());
			throw new Error("whatsapp_message_id_missing");
		}
		const result = { providerMessageId, accepted: true };
		await this.state.putOutbound(key, result, new Date().toISOString());
		pilotLog("info", "whatsapp_send_accepted", {
			idempotency_key: key,
			provider_message_id: providerMessageId,
		});
		return result;
	}
}

export function parseWhatsAppWebhook(
	rawBody: string,
): WhatsAppInboundMessage[] {
	const payload = JSON.parse(rawBody) as {
		entry?: Array<{
			changes?: Array<{
				value?: {
					messages?: Array<{
						id?: string;
						from?: string;
						timestamp?: string;
						type?: string;
						text?: { body?: string };
					}>;
				};
			}>;
		}>;
	};
	const messages: WhatsAppInboundMessage[] = [];
	for (const entry of payload.entry ?? []) {
		for (const change of entry.changes ?? []) {
			for (const message of change.value?.messages ?? []) {
				if (
					message.type !== "text" ||
					!message.id ||
					!message.from ||
					!message.text?.body
				)
					continue;
				const timestampSeconds = Number.parseInt(message.timestamp ?? "", 10);
				messages.push({
					id: message.id,
					from: normalizePhone(message.from),
					timestamp: Number.isFinite(timestampSeconds)
						? new Date(timestampSeconds * 1_000).toISOString()
						: new Date().toISOString(),
					text: message.text.body.trim(),
				});
			}
		}
	}
	return messages;
}
