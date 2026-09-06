import type { SendMessageResult } from "../autonomy/providers.ts";
import type { DatabaseClient } from "../db/client.ts";
import type {
	ApprovalRow,
	OutboundReservation,
	PilotStateStoreLike,
} from "./state-store.ts";

interface OutboundRow {
	provider_message_id: string | null;
	status: OutboundReservation["status"];
	crm_writeback_completed_at: Date | string | null;
}

function iso(value: Date | string): string {
	return value instanceof Date
		? value.toISOString()
		: new Date(value).toISOString();
}

export class PostgresPilotStateStore implements PilotStateStoreLike {
	readonly backend = "postgres" as const;

	constructor(private readonly sql: DatabaseClient) {}

	async healthCheck(): Promise<boolean> {
		const rows = await this.sql<{ ok: number }[]>`SELECT 1 AS ok`;
		return rows[0]?.ok === 1;
	}

	async reserveOutbound(
		key: string,
		opportunityId: string,
		provider: string,
		requestMetadata: Record<string, unknown>,
		now: string,
	): Promise<OutboundReservation> {
		const inserted = await this.sql<{ idempotency_key: string }[]>`
			INSERT INTO oplera.pilot_outbound_operations (
				idempotency_key,
				opportunity_id,
				provider,
				status,
				request_metadata,
				created_at,
				updated_at
			)
			VALUES (
				${key},
				${opportunityId},
				${provider},
				'reserved',
				${JSON.stringify(requestMetadata)}::jsonb,
				${now},
				${now}
			)
			ON CONFLICT (idempotency_key) DO NOTHING
			RETURNING idempotency_key
		`;
		if (inserted.length > 0)
			return { acquired: true, status: "reserved", result: null };

		const row = await this.outboundRow(key);
		if (!row) throw new Error("pilot_outbound_reservation_missing");
		return {
			acquired: false,
			status: row.status,
			result: row.provider_message_id
				? { providerMessageId: row.provider_message_id, accepted: true }
				: null,
		};
	}

	async getOutbound(key: string): Promise<SendMessageResult | null> {
		const row = await this.outboundRow(key);
		return row?.provider_message_id
			? { providerMessageId: row.provider_message_id, accepted: true }
			: null;
	}

	async putOutbound(
		key: string,
		result: SendMessageResult,
		now: string,
	): Promise<void> {
		const rows = await this.sql<{ idempotency_key: string }[]>`
			UPDATE oplera.pilot_outbound_operations
			SET
				provider_message_id = ${result.providerMessageId},
				status = 'accepted',
				provider_accepted_at = ${now},
				updated_at = ${now}
			WHERE idempotency_key = ${key}
			RETURNING idempotency_key
		`;
		if (rows.length === 0) throw new Error("pilot_outbound_not_reserved");
	}

	async releaseOutbound(key: string): Promise<void> {
		await this.sql`
			DELETE FROM oplera.pilot_outbound_operations
			WHERE idempotency_key = ${key}
				AND status = 'reserved'
				AND provider_message_id IS NULL
		`;
	}

	async markOutboundUncertain(key: string, now: string): Promise<void> {
		await this.sql`
			UPDATE oplera.pilot_outbound_operations
			SET status = 'uncertain', updated_at = ${now}
			WHERE idempotency_key = ${key}
				AND provider_message_id IS NULL
		`;
	}

	async isWritebackComplete(key: string): Promise<boolean> {
		return Boolean((await this.outboundRow(key))?.crm_writeback_completed_at);
	}

	async markWritebackComplete(key: string, now: string): Promise<void> {
		await this.sql`
			UPDATE oplera.pilot_outbound_operations
			SET
				crm_writeback_completed_at = ${now},
				status = 'writeback_completed',
				updated_at = ${now}
			WHERE idempotency_key = ${key}
				AND provider_message_id IS NOT NULL
		`;
	}

	async markInboundSeen(
		provider: string,
		messageId: string,
		now: string,
	): Promise<boolean> {
		const rows = await this.sql<{ external_message_id: string }[]>`
			INSERT INTO oplera.pilot_inbound_messages (
				provider,
				external_message_id,
				processed_at,
				created_at
			)
			VALUES (${provider}, ${messageId}, ${now}, ${now})
			ON CONFLICT (provider, external_message_id) DO NOTHING
			RETURNING external_message_id
		`;
		return rows.length === 1;
	}

	async markInboundOpportunity(
		provider: string,
		messageId: string,
		opportunityId: string,
	): Promise<void> {
		await this.sql`
			UPDATE oplera.pilot_inbound_messages
			SET opportunity_id = ${opportunityId}
			WHERE provider = ${provider} AND external_message_id = ${messageId}
		`;
	}

	async approve(
		opportunityId: string,
		attempt: number,
		fingerprint: string,
		approvedBy: string,
		now: string,
	): Promise<void> {
		await this.sql.begin(async (tx) => {
			await tx`
				UPDATE oplera.pilot_approvals
				SET consumed_at = ${now}
				WHERE opportunity_id = ${opportunityId} AND consumed_at IS NULL
			`;
			await tx`
				INSERT INTO oplera.pilot_approvals (
					opportunity_id,
					attempt,
					fingerprint,
					approved_by,
					approved_at,
					consumed_at,
					metadata
				)
				VALUES (
					${opportunityId},
					${attempt},
					${fingerprint},
					${approvedBy},
					${now},
					NULL,
					'{}'::jsonb
				)
				ON CONFLICT (opportunity_id, fingerprint)
				DO UPDATE SET
					attempt = EXCLUDED.attempt,
					approved_by = EXCLUDED.approved_by,
					approved_at = EXCLUDED.approved_at,
					consumed_at = NULL
			`;
		});
	}

	async getApproval(
		opportunityId: string,
		fingerprint: string,
	): Promise<ApprovalRow | null> {
		const rows = await this.sql<
			Array<{
				fingerprint: string;
				attempt: number;
				approved_by: string;
				approved_at: Date | string;
				consumed_at: Date | string | null;
			}>
		>`
			SELECT fingerprint, attempt, approved_by, approved_at, consumed_at
			FROM oplera.pilot_approvals
			WHERE opportunity_id = ${opportunityId}
				AND fingerprint = ${fingerprint}
				AND consumed_at IS NULL
			ORDER BY approved_at DESC
			LIMIT 1
		`;
		const row = rows[0];
		if (!row) return null;
		return {
			fingerprint: row.fingerprint,
			attempt: row.attempt,
			approved_by: row.approved_by,
			approved_at: iso(row.approved_at),
			consumed_at: row.consumed_at ? iso(row.consumed_at) : null,
		};
	}

	async consumeApproval(opportunityId: string, now: string): Promise<void> {
		await this.sql`
			UPDATE oplera.pilot_approvals
			SET consumed_at = ${now}
			WHERE opportunity_id = ${opportunityId} AND consumed_at IS NULL
		`;
	}

	private async outboundRow(key: string): Promise<OutboundRow | null> {
		const rows = await this.sql<OutboundRow[]>`
			SELECT provider_message_id, status, crm_writeback_completed_at
			FROM oplera.pilot_outbound_operations
			WHERE idempotency_key = ${key}
		`;
		return rows[0] ?? null;
	}
}
