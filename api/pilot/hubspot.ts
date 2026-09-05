import type { CRMProvider } from "../autonomy/providers.ts";
import { scoreRecoveryCandidate } from "../autonomy/scoring.ts";
import {
	type RecoveryCandidate,
	type RecoverySignals,
	type RecoveryStatus,
	recoveryStatusSchema,
} from "../autonomy/types.ts";
import type { ConversationMessage } from "../domain/recovery.ts";
import { normalizePhone, type PilotConfig } from "./config.ts";
import { pilotLog } from "./logger.ts";

interface HubSpotAssociationResult {
	id: string;
	type?: string;
}

interface HubSpotRecord {
	id: string;
	properties: Record<string, string | null | undefined>;
	createdAt?: string;
	updatedAt?: string;
	associations?: Record<string, { results?: HubSpotAssociationResult[] }>;
}

interface NormalizedActivity {
	type: "notes" | "calls" | "emails" | "meetings";
	timestamp: string;
	text: string;
	direction?: "inbound" | "outbound";
}

type FetchLike = typeof fetch;

function stripHtml(value: string): string {
	return value
		.replace(/<[^>]+>/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

function safeDate(value: string | null | undefined, fallback: string): string {
	if (!value) return fallback;
	const parsed = Date.parse(value);
	return Number.isNaN(parsed) ? fallback : new Date(parsed).toISOString();
}

function activityText(
	type: NormalizedActivity["type"],
	record: HubSpotRecord,
): string {
	const p = record.properties;
	if (type === "notes") return stripHtml(p.hs_note_body ?? "");
	if (type === "calls") return stripHtml(p.hs_call_body ?? "");
	if (type === "emails")
		return stripHtml(`${p.hs_email_subject ?? ""} ${p.hs_email_text ?? ""}`);
	return stripHtml(`${p.hs_meeting_title ?? ""} ${p.hs_meeting_body ?? ""}`);
}

function activityDirection(
	type: NormalizedActivity["type"],
	record: HubSpotRecord,
): "inbound" | "outbound" | undefined {
	const value =
		type === "emails"
			? record.properties.hs_email_direction
			: type === "calls"
				? record.properties.hs_call_direction
				: undefined;
	if (!value) return undefined;
	const normalized = value.toLowerCase();
	if (normalized.includes("inbound")) return "inbound";
	if (normalized.includes("outbound")) return "outbound";
	return undefined;
}

function deriveLostReason(text: string): RecoverySignals["lostReason"] {
	if (/timing|momento|mais tarde|adiar|depois/i.test(text)) return "timing";
	if (/budget|orçamento|sem verba|preço|caro/i.test(text)) return "budget";
	return text.trim() ? "other" : "none";
}

function parseOpleraConversation(
	activities: NormalizedActivity[],
): ConversationMessage[] {
	const messages: ConversationMessage[] = [];
	for (const activity of activities) {
		if (activity.type !== "notes") continue;
		const inbound = activity.text.match(/^\[OPLERA_INBOUND\]\s*(.*)$/s);
		if (inbound) {
			messages.push({
				direction: "inbound",
				text: inbound[1] ?? "",
				timestamp: activity.timestamp,
			});
			continue;
		}
		const outbound = activity.text.match(/^\[OPLERA_OUTBOUND\]\s*(.*)$/s);
		if (outbound) {
			messages.push({
				direction: "outbound",
				text: outbound[1] ?? "",
				timestamp: activity.timestamp,
			});
		}
	}
	return messages.sort(
		(a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp),
	);
}

export class HubSpotCRMProvider implements CRMProvider {
	private readonly apiBase = "https://api.hubapi.com";

	constructor(
		private readonly config: PilotConfig,
		private readonly fetcher: FetchLike = fetch,
		private readonly now: () => Date = () => new Date(),
	) {}

	async listRecoveryCandidates(): Promise<RecoveryCandidate[]> {
		const results = await Promise.all(
			this.config.HUBSPOT_DEAL_IDS.map((id) => this.getOpportunityContext(id)),
		);
		return results.filter((item): item is RecoveryCandidate => item !== null);
	}

	async getOpportunityContext(id: string): Promise<RecoveryCandidate | null> {
		this.assertAllowedDeal(id);
		const deal = await this.getDeal(id);
		if (!deal) return null;
		const contacts = await this.readAssociated(deal, "contacts", [
			"firstname",
			"lastname",
			"email",
			"phone",
			"mobilephone",
		]);
		const companies = await this.readAssociated(deal, "companies", ["name"]);
		const activities = await this.readActivities(deal);
		const contact = contacts[0];
		const company = companies[0];
		const reference = this.now();
		const fallbackTimestamp =
			deal.updatedAt ?? deal.createdAt ?? reference.toISOString();
		const latestActivityMs = Math.max(
			Date.parse(fallbackTimestamp) || 0,
			...activities.map((item) => Date.parse(item.timestamp) || 0),
		);
		const lastActivity = new Date(
			latestActivityMs || reference.getTime(),
		).toISOString();
		const daysInactive = Math.max(
			0,
			Math.floor((reference.getTime() - Date.parse(lastActivity)) / 86_400_000),
		);
		const combinedText = [
			deal.properties[this.config.HUBSPOT_LOST_REASON_PROPERTY] ?? "",
			...activities.map((item) => item.text),
		].join("\n");
		const conversation = parseOpleraConversation(activities);
		const lastConversation = conversation.at(-1);
		const signals: RecoverySignals = {
			previousEngagement: activities.length > 0,
			proposalSent: /proposta|proposal|quote|orçamento enviado/i.test(
				combinedText,
			),
			explicitBuyingQuestion:
				/quanto|preço|valor|fechar|contrato|começar|iniciar|pagamento/i.test(
					combinedText,
				),
			knownObjection: /budget|orçamento|sem verba|preço|caro|objeção/i.test(
				combinedText,
			),
			sellerDropped: Boolean(
				lastConversation?.direction === "inbound" && daysInactive >= 2,
			),
			lostReason: deriveLostReason(
				deal.properties[this.config.HUBSPOT_LOST_REASON_PROPERTY] ??
					combinedText,
			),
		};
		const storedStatus =
			deal.properties[this.config.HUBSPOT_RECOVERY_STATUS_PROPERTY] ??
			"discovered";
		const parsedStatus = recoveryStatusSchema.safeParse(storedStatus);
		const status: RecoveryStatus = parsedStatus.success
			? parsedStatus.data
			: "discovered";
		const optedOut =
			status === "suppressed" || /\[OPLERA_OPT_OUT\]/i.test(combinedText);
		const activeHumanConversation =
			(
				deal.properties[this.config.HUBSPOT_ACTIVE_HUMAN_PROPERTY] ?? ""
			).toLowerCase() === "true";
		const score = scoreRecoveryCandidate({
			amount: Number.parseFloat(deal.properties.amount ?? "0") || 0,
			daysInactive,
			signals,
			optedOut,
			activeHumanConversation,
		});
		const attempt = Math.max(
			0,
			Number.parseInt(
				deal.properties[this.config.HUBSPOT_RECOVERY_ATTEMPTS_PROPERTY] ?? "0",
				10,
			) || 0,
		);
		const contactName =
			`${contact?.properties.firstname ?? ""} ${contact?.properties.lastname ?? ""}`.trim() ||
			contact?.properties.email ||
			`HubSpot contact ${contact?.id ?? "unknown"}`;

		return {
			id: deal.id,
			crmId: deal.id,
			contactName,
			company: company?.properties.name || "Unknown company",
			dealName: deal.properties.dealname || `HubSpot deal ${deal.id}`,
			pipelineStage: deal.properties.dealstage || "unknown",
			amount: Number.parseFloat(deal.properties.amount ?? "0") || 0,
			daysInactive,
			lastActivity,
			originalReason:
				deal.properties[this.config.HUBSPOT_LOST_REASON_PROPERTY] ?? "",
			recoveryScore: score.score,
			reasonCode: score.reasonCode,
			reasonSummary: score.reasonSummary,
			status: optedOut ? "suppressed" : status,
			nextAction:
				attempt === 0
					? "Human approval required before pilot first contact."
					: score.reasonSummary,
			attempt,
			assignee: deal.properties.hubspot_owner_id || "unassigned",
			channel: "whatsapp",
			evidence: [
				`HubSpot deal ${deal.id}`,
				`Activities imported: ${activities.length}`,
				...activities
					.filter((item) => item.text)
					.slice(-8)
					.map((item) => `${item.type}: ${item.text.slice(0, 180)}`),
			].slice(0, 20),
			conversation,
			signals,
			optedOut,
			activeHumanConversation,
		};
	}

	async updateOpportunity(id: string, status: RecoveryStatus): Promise<void> {
		this.assertAllowedDeal(id);
		await this.patchDeal(id, {
			[this.config.HUBSPOT_RECOVERY_STATUS_PROPERTY]: status,
		});
	}

	async recordContactAttempt(id: string): Promise<void> {
		this.assertAllowedDeal(id);
		const params = new URLSearchParams({
			properties: this.config.HUBSPOT_RECOVERY_ATTEMPTS_PROPERTY,
		});
		const deal = await this.request<HubSpotRecord>(
			`/crm/v3/objects/deals/${encodeURIComponent(id)}?${params}`,
		);
		const current = Math.max(
			0,
			Number.parseInt(
				deal.properties[this.config.HUBSPOT_RECOVERY_ATTEMPTS_PROPERTY] ?? "0",
				10,
			) || 0,
		);
		await this.patchDeal(id, {
			[this.config.HUBSPOT_RECOVERY_ATTEMPTS_PROPERTY]: String(current + 1),
		});
	}

	async appendConversationMessage(
		id: string,
		message: ConversationMessage,
	): Promise<void> {
		const prefix =
			message.direction === "inbound"
				? "[OPLERA_INBOUND]"
				: "[OPLERA_OUTBOUND]";
		await this.createDealNote(
			id,
			`${prefix} ${message.text}`,
			message.timestamp,
		);
	}

	async createActivity(id: string, summary: string): Promise<void> {
		await this.createDealNote(
			id,
			`[OPLERA_ACTIVITY] ${summary}`,
			this.now().toISOString(),
		);
	}

	async resolveMessagingRecipient(id: string): Promise<string> {
		this.assertAllowedDeal(id);
		const deal = await this.getDeal(id);
		if (!deal) throw new Error("hubspot_deal_not_found");
		const contacts = await this.readAssociated(deal, "contacts", [
			"phone",
			"mobilephone",
		]);
		const contact = contacts[0];
		const phone = normalizePhone(
			contact?.properties.mobilephone || contact?.properties.phone || "",
		);
		if (!phone) throw new Error("hubspot_contact_phone_missing");
		return phone;
	}

	async findAllowedOpportunityByPhone(phone: string): Promise<string | null> {
		const normalized = normalizePhone(phone);
		const matches: string[] = [];
		for (const dealId of this.config.HUBSPOT_DEAL_IDS) {
			try {
				if ((await this.resolveMessagingRecipient(dealId)) === normalized)
					matches.push(dealId);
			} catch (error) {
				pilotLog("warn", "hubspot_phone_resolution_skipped", {
					deal_id: dealId,
					error: error instanceof Error ? error.message : "unknown_error",
				});
			}
		}
		if (matches.length > 1)
			throw new Error("pilot_phone_matches_multiple_deals");
		return matches[0] ?? null;
	}

	private assertAllowedDeal(id: string): void {
		if (!this.config.HUBSPOT_DEAL_IDS.includes(id))
			throw new Error("pilot_deal_not_allowlisted");
	}

	private async getDeal(id: string): Promise<HubSpotRecord | null> {
		const properties = [
			"dealname",
			"dealstage",
			"pipeline",
			"amount",
			"hubspot_owner_id",
			this.config.HUBSPOT_RECOVERY_STATUS_PROPERTY,
			this.config.HUBSPOT_RECOVERY_ATTEMPTS_PROPERTY,
			this.config.HUBSPOT_ACTIVE_HUMAN_PROPERTY,
			this.config.HUBSPOT_LOST_REASON_PROPERTY,
		];
		const params = new URLSearchParams({
			properties: properties.join(","),
			associations: "contacts,companies,notes,calls,emails,meetings",
		});
		try {
			return await this.request<HubSpotRecord>(
				`/crm/v3/objects/deals/${encodeURIComponent(id)}?${params}`,
			);
		} catch (error) {
			if (error instanceof Error && error.message.includes("hubspot_http_404"))
				return null;
			throw error;
		}
	}

	private async readActivities(
		deal: HubSpotRecord,
	): Promise<NormalizedActivity[]> {
		const definitions: Array<{
			type: NormalizedActivity["type"];
			properties: string[];
		}> = [
			{ type: "notes", properties: ["hs_timestamp", "hs_note_body"] },
			{
				type: "calls",
				properties: [
					"hs_timestamp",
					"hs_call_body",
					"hs_call_direction",
					"hs_call_status",
				],
			},
			{
				type: "emails",
				properties: [
					"hs_timestamp",
					"hs_email_text",
					"hs_email_subject",
					"hs_email_direction",
				],
			},
			{
				type: "meetings",
				properties: [
					"hs_timestamp",
					"hs_meeting_body",
					"hs_meeting_title",
					"hs_meeting_outcome",
				],
			},
		];
		const output: NormalizedActivity[] = [];
		for (const definition of definitions) {
			const records = await this.readAssociated(
				deal,
				definition.type,
				definition.properties,
			);
			for (const record of records) {
				output.push({
					type: definition.type,
					timestamp: safeDate(
						record.properties.hs_timestamp,
						record.updatedAt ?? record.createdAt ?? this.now().toISOString(),
					),
					text: activityText(definition.type, record),
					direction: activityDirection(definition.type, record),
				});
			}
		}
		return output.sort(
			(a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp),
		);
	}

	private async readAssociated(
		deal: HubSpotRecord,
		type: string,
		properties: string[],
	): Promise<HubSpotRecord[]> {
		const ids =
			deal.associations?.[type]?.results?.map((item) => item.id) ?? [];
		if (!ids.length) return [];
		const results: HubSpotRecord[] = [];
		for (let index = 0; index < ids.length; index += 100) {
			const chunk = ids.slice(index, index + 100);
			const response = await this.request<{ results: HubSpotRecord[] }>(
				`/crm/v3/objects/${encodeURIComponent(type)}/batch/read`,
				{
					method: "POST",
					body: JSON.stringify({
						properties,
						inputs: chunk.map((id) => ({ id })),
					}),
				},
			);
			results.push(...response.results);
		}
		return results;
	}

	private async patchDeal(
		id: string,
		properties: Record<string, string>,
	): Promise<void> {
		await this.request(`/crm/v3/objects/deals/${encodeURIComponent(id)}`, {
			method: "PATCH",
			body: JSON.stringify({ properties }),
		});
	}

	private async createDealNote(
		id: string,
		body: string,
		timestamp: string,
	): Promise<void> {
		this.assertAllowedDeal(id);
		await this.request("/crm/v3/objects/notes", {
			method: "POST",
			body: JSON.stringify({
				properties: { hs_timestamp: timestamp, hs_note_body: body },
				associations: [
					{
						to: { id },
						types: [
							{
								associationCategory: "HUBSPOT_DEFINED",
								associationTypeId:
									this.config.HUBSPOT_NOTE_TO_DEAL_ASSOCIATION_TYPE_ID,
							},
						],
					},
				],
			}),
		});
	}

	private async request<T = unknown>(
		path: string,
		init: RequestInit = {},
	): Promise<T> {
		const response = await this.fetcher(`${this.apiBase}${path}`, {
			...init,
			headers: {
				accept: "application/json",
				"content-type": "application/json",
				authorization: `Bearer ${this.config.HUBSPOT_ACCESS_TOKEN}`,
				...init.headers,
			},
			signal: AbortSignal.timeout(15_000),
		});
		const text = await response.text();
		if (!response.ok) {
			pilotLog("error", "hubspot_request_failed", {
				status: response.status,
				path,
				body: text.slice(0, 500),
			});
			throw new Error(`hubspot_http_${response.status}`);
		}
		return (text ? JSON.parse(text) : {}) as T;
	}
}
