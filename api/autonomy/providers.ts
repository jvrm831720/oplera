import type { RecoveryCandidate, RecoveryStatus } from "./types.ts";

export interface SendMessageInput {
	idempotencyKey: string;
	opportunityId: string;
	channel: "whatsapp" | "email";
	text: string;
	mode: "free_form" | "approved_template";
}

export interface SendMessageResult {
	providerMessageId: string;
	accepted: boolean;
}

export interface MessagingProvider {
	sendMessage(input: SendMessageInput): Promise<SendMessageResult>;
}

export interface CRMProvider {
	listRecoveryCandidates(): Promise<RecoveryCandidate[]>;
	getOpportunityContext(id: string): Promise<RecoveryCandidate | null>;
	updateOpportunity(id: string, status: RecoveryStatus): Promise<void>;
	createActivity(id: string, summary: string): Promise<void>;
}

export interface CalendarProvider {
	bookMeeting(input: {
		opportunityId: string;
		startsAt: string;
		durationMinutes: number;
	}): Promise<{ meetingId: string }>;
}

export interface AIProvider {
	generateStructured<T>(input: {
		task: string;
		context: unknown;
		fallback: T;
	}): Promise<T>;
}

export class DemoMessagingProvider implements MessagingProvider {
	private readonly sent = new Map<string, SendMessageResult>();

	async sendMessage(input: SendMessageInput): Promise<SendMessageResult> {
		const existing = this.sent.get(input.idempotencyKey);
		if (existing) return existing;
		const result = {
			providerMessageId: `demo-msg-${this.sent.size + 1}`,
			accepted: true,
		};
		this.sent.set(input.idempotencyKey, result);
		return result;
	}
}

export class DemoCRMProvider implements CRMProvider {
	private readonly opportunities = new Map<string, RecoveryCandidate>();
	readonly activities: Array<{ opportunityId: string; summary: string }> = [];

	constructor(candidates: RecoveryCandidate[]) {
		for (const candidate of candidates) {
			this.opportunities.set(candidate.id, structuredClone(candidate));
		}
	}

	async listRecoveryCandidates(): Promise<RecoveryCandidate[]> {
		return [...this.opportunities.values()].map((item) => structuredClone(item));
	}

	async getOpportunityContext(id: string): Promise<RecoveryCandidate | null> {
		const value = this.opportunities.get(id);
		return value ? structuredClone(value) : null;
	}

	async updateOpportunity(id: string, status: RecoveryStatus): Promise<void> {
		const value = this.opportunities.get(id);
		if (!value) throw new Error(`unknown opportunity ${id}`);
		value.status = status;
	}

	async createActivity(id: string, summary: string): Promise<void> {
		if (!this.opportunities.has(id)) throw new Error(`unknown opportunity ${id}`);
		this.activities.push({ opportunityId: id, summary });
	}
}

export class DemoCalendarProvider implements CalendarProvider {
	private count = 0;
	async bookMeeting(): Promise<{ meetingId: string }> {
		this.count += 1;
		return { meetingId: `demo-meeting-${this.count}` };
	}
}

export class DeterministicAIProvider implements AIProvider {
	async generateStructured<T>(input: { fallback: T }): Promise<T> {
		return structuredClone(input.fallback);
	}
}
