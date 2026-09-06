import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { SendMessageResult } from "../autonomy/providers.ts";
import type { MaybePromise } from "../autonomy/persistence.ts";

export interface ApprovalRow {
	fingerprint: string;
	attempt: number;
	approved_by: string;
	approved_at: string;
	consumed_at: string | null;
}

export interface OutboundReservation {
	acquired: boolean;
	status: "reserved" | "accepted" | "writeback_completed" | "uncertain";
	result: SendMessageResult | null;
}

export interface PilotStateStoreLike {
	readonly backend: "sqlite" | "postgres";
	healthCheck(): MaybePromise<boolean>;
	reserveOutbound(
		key: string,
		opportunityId: string,
		provider: string,
		requestMetadata: Record<string, unknown>,
		now: string,
	): MaybePromise<OutboundReservation>;
	getOutbound(key: string): MaybePromise<SendMessageResult | null>;
	putOutbound(
		key: string,
		result: SendMessageResult,
		now: string,
	): MaybePromise<void>;
	releaseOutbound(key: string): MaybePromise<void>;
	markOutboundUncertain(key: string, now: string): MaybePromise<void>;
	isWritebackComplete(key: string): MaybePromise<boolean>;
	markWritebackComplete(key: string, now: string): MaybePromise<void>;
	markInboundSeen(
		provider: string,
		messageId: string,
		now: string,
	): MaybePromise<boolean>;
	markInboundOpportunity(
		provider: string,
		messageId: string,
		opportunityId: string,
	): MaybePromise<void>;
	approve(
		opportunityId: string,
		attempt: number,
		fingerprint: string,
		approvedBy: string,
		now: string,
	): MaybePromise<void>;
	getApproval(
		opportunityId: string,
		fingerprint: string,
	): MaybePromise<ApprovalRow | null>;
	consumeApproval(opportunityId: string, now: string): MaybePromise<void>;
}

interface OutboundRow {
	provider_message_id: string | null;
	accepted: number | null;
	status: OutboundReservation["status"];
	writeback_completed_at: string | null;
}

export class PilotStateStore implements PilotStateStoreLike {
	readonly backend = "sqlite" as const;
	private readonly db: Database;

	constructor(path: string) {
		if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
		this.db = new Database(path, { create: true });
		if (path !== ":memory:") this.db.run("PRAGMA journal_mode = WAL;");
		this.db.run(`
			CREATE TABLE IF NOT EXISTS pilot_outbound_operations (
				idempotency_key TEXT PRIMARY KEY,
				opportunity_id TEXT NOT NULL,
				provider TEXT NOT NULL,
				provider_message_id TEXT,
				accepted INTEGER,
				status TEXT NOT NULL,
				request_metadata TEXT NOT NULL,
				provider_accepted_at TEXT,
				writeback_completed_at TEXT,
				created_at TEXT NOT NULL,
				updated_at TEXT NOT NULL
			);
			CREATE TABLE IF NOT EXISTS pilot_inbound_messages (
				provider TEXT NOT NULL,
				external_message_id TEXT NOT NULL,
				opportunity_id TEXT,
				processed_at TEXT NOT NULL,
				created_at TEXT NOT NULL,
				PRIMARY KEY (provider, external_message_id)
			);
			CREATE TABLE IF NOT EXISTS pilot_approvals_v042 (
				opportunity_id TEXT PRIMARY KEY,
				attempt INTEGER NOT NULL,
				fingerprint TEXT NOT NULL,
				approved_by TEXT NOT NULL,
				approved_at TEXT NOT NULL,
				consumed_at TEXT
			);
		`);
	}

	healthCheck(): boolean {
		const row = this.db.query("SELECT 1 AS ok").get() as { ok: number } | null;
		return row?.ok === 1;
	}

	reserveOutbound(
		key: string,
		opportunityId: string,
		provider: string,
		requestMetadata: Record<string, unknown>,
		now: string,
	): OutboundReservation {
		const inserted = this.db
			.query(`
				INSERT OR IGNORE INTO pilot_outbound_operations (
					idempotency_key, opportunity_id, provider, status, request_metadata, created_at, updated_at
				) VALUES (?, ?, ?, 'reserved', ?, ?, ?)
			`)
			.run(key, opportunityId, provider, JSON.stringify(requestMetadata), now, now);
		if (inserted.changes > 0)
			return { acquired: true, status: "reserved", result: null };
		const row = this.outboundRow(key);
		if (!row) throw new Error("pilot_outbound_reservation_missing");
		return {
			acquired: false,
			status: row.status,
			result:
				row.provider_message_id && row.accepted !== null
					? {
							providerMessageId: row.provider_message_id,
							accepted: Boolean(row.accepted),
						}
					: null,
		};
	}

	getOutbound(key: string): SendMessageResult | null {
		const row = this.outboundRow(key);
		if (!row?.provider_message_id || row.accepted === null) return null;
		return {
			providerMessageId: row.provider_message_id,
			accepted: Boolean(row.accepted),
		};
	}

	putOutbound(key: string, result: SendMessageResult, now: string): void {
		const updated = this.db
			.query(`
				UPDATE pilot_outbound_operations
				SET provider_message_id = ?, accepted = ?, status = 'accepted', provider_accepted_at = ?, updated_at = ?
				WHERE idempotency_key = ?
			`)
			.run(result.providerMessageId, result.accepted ? 1 : 0, now, now, key);
		if (updated.changes === 0) throw new Error("pilot_outbound_not_reserved");
	}

	releaseOutbound(key: string): void {
		this.db
			.query(
				"DELETE FROM pilot_outbound_operations WHERE idempotency_key = ? AND status = 'reserved' AND provider_message_id IS NULL",
			)
			.run(key);
	}

	markOutboundUncertain(key: string, now: string): void {
		this.db
			.query(`
				UPDATE pilot_outbound_operations
				SET status = 'uncertain', updated_at = ?
				WHERE idempotency_key = ? AND provider_message_id IS NULL
			`)
			.run(now, key);
	}

	isWritebackComplete(key: string): boolean {
		return Boolean(this.outboundRow(key)?.writeback_completed_at);
	}

	markWritebackComplete(key: string, now: string): void {
		this.db
			.query(`
				UPDATE pilot_outbound_operations
				SET writeback_completed_at = ?, status = 'writeback_completed', updated_at = ?
				WHERE idempotency_key = ? AND provider_message_id IS NOT NULL
			`)
			.run(now, now, key);
	}

	markInboundSeen(provider: string, messageId: string, now: string): boolean {
		const result = this.db
			.query(`
				INSERT OR IGNORE INTO pilot_inbound_messages (
					provider, external_message_id, processed_at, created_at
				) VALUES (?, ?, ?, ?)
			`)
			.run(provider, messageId, now, now);
		return result.changes > 0;
	}

	markInboundOpportunity(
		provider: string,
		messageId: string,
		opportunityId: string,
	): void {
		this.db
			.query(`
				UPDATE pilot_inbound_messages
				SET opportunity_id = ?
				WHERE provider = ? AND external_message_id = ?
			`)
			.run(opportunityId, provider, messageId);
	}

	approve(
		opportunityId: string,
		attempt: number,
		fingerprint: string,
		approvedBy: string,
		now: string,
	): void {
		this.db
			.query(`
				INSERT INTO pilot_approvals_v042 (
					opportunity_id, attempt, fingerprint, approved_by, approved_at, consumed_at
				) VALUES (?, ?, ?, ?, ?, NULL)
				ON CONFLICT(opportunity_id) DO UPDATE SET
					attempt = excluded.attempt,
					fingerprint = excluded.fingerprint,
					approved_by = excluded.approved_by,
					approved_at = excluded.approved_at,
					consumed_at = NULL
			`)
			.run(opportunityId, attempt, fingerprint, approvedBy, now);
	}

	getApproval(opportunityId: string, fingerprint: string): ApprovalRow | null {
		const row = this.db
			.query(`
				SELECT fingerprint, attempt, approved_by, approved_at, consumed_at
				FROM pilot_approvals_v042
				WHERE opportunity_id = ?
			`)
			.get(opportunityId) as ApprovalRow | null;
		if (!row || row.fingerprint !== fingerprint || row.consumed_at) return null;
		return row;
	}

	consumeApproval(opportunityId: string, now: string): void {
		this.db
			.query(
				"UPDATE pilot_approvals_v042 SET consumed_at = ? WHERE opportunity_id = ? AND consumed_at IS NULL",
			)
			.run(now, opportunityId);
	}

	private outboundRow(key: string): OutboundRow | null {
		return this.db
			.query(`
				SELECT provider_message_id, accepted, status, writeback_completed_at
				FROM pilot_outbound_operations
				WHERE idempotency_key = ?
			`)
			.get(key) as OutboundRow | null;
	}
}
