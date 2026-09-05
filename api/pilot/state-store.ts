import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { SendMessageResult } from "../autonomy/providers.ts";

interface OutboundRow {
	result_json: string;
	writeback_completed_at: string | null;
}

interface ApprovalRow {
	fingerprint: string;
	approved_by: string;
	approved_at: string;
	consumed_at: string | null;
}

export class PilotStateStore {
	private readonly db: Database;

	constructor(path: string) {
		if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
		this.db = new Database(path, { create: true });
		if (path !== ":memory:") this.db.run("PRAGMA journal_mode = WAL;");
		this.db.run(`
			CREATE TABLE IF NOT EXISTS pilot_outbound_idempotency (
				idempotency_key TEXT PRIMARY KEY,
				result_json TEXT NOT NULL,
				created_at TEXT NOT NULL,
				writeback_completed_at TEXT
			);
			CREATE TABLE IF NOT EXISTS pilot_inbound_idempotency (
				message_id TEXT PRIMARY KEY,
				created_at TEXT NOT NULL
			);
			CREATE TABLE IF NOT EXISTS pilot_approvals (
				opportunity_id TEXT PRIMARY KEY,
				fingerprint TEXT NOT NULL,
				approved_by TEXT NOT NULL,
				approved_at TEXT NOT NULL,
				consumed_at TEXT
			);
		`);
	}

	getOutbound(key: string): SendMessageResult | null {
		const row = this.db
			.query("SELECT result_json, writeback_completed_at FROM pilot_outbound_idempotency WHERE idempotency_key = ?")
			.get(key) as OutboundRow | null;
		return row ? (JSON.parse(row.result_json) as SendMessageResult) : null;
	}

	putOutbound(key: string, result: SendMessageResult, now: string): void {
		this.db
			.query(
				"INSERT OR IGNORE INTO pilot_outbound_idempotency (idempotency_key, result_json, created_at) VALUES (?, ?, ?)",
			)
			.run(key, JSON.stringify(result), now);
	}

	isWritebackComplete(key: string): boolean {
		const row = this.db
			.query("SELECT writeback_completed_at FROM pilot_outbound_idempotency WHERE idempotency_key = ?")
			.get(key) as Pick<OutboundRow, "writeback_completed_at"> | null;
		return Boolean(row?.writeback_completed_at);
	}

	markWritebackComplete(key: string, now: string): void {
		this.db
			.query(
				"UPDATE pilot_outbound_idempotency SET writeback_completed_at = ? WHERE idempotency_key = ?",
			)
			.run(now, key);
	}

	markInboundSeen(messageId: string, now: string): boolean {
		const result = this.db
			.query("INSERT OR IGNORE INTO pilot_inbound_idempotency (message_id, created_at) VALUES (?, ?)")
			.run(messageId, now);
		return result.changes > 0;
	}

	approve(
		opportunityId: string,
		fingerprint: string,
		approvedBy: string,
		now: string,
	): void {
		this.db
			.query(`
				INSERT INTO pilot_approvals (opportunity_id, fingerprint, approved_by, approved_at, consumed_at)
				VALUES (?, ?, ?, ?, NULL)
				ON CONFLICT(opportunity_id) DO UPDATE SET
					fingerprint = excluded.fingerprint,
					approved_by = excluded.approved_by,
					approved_at = excluded.approved_at,
					consumed_at = NULL
			`)
			.run(opportunityId, fingerprint, approvedBy, now);
	}

	getApproval(opportunityId: string, fingerprint: string): ApprovalRow | null {
		const row = this.db
			.query(
				"SELECT fingerprint, approved_by, approved_at, consumed_at FROM pilot_approvals WHERE opportunity_id = ?",
			)
			.get(opportunityId) as ApprovalRow | null;
		if (!row || row.fingerprint !== fingerprint || row.consumed_at) return null;
		return row;
	}

	consumeApproval(opportunityId: string, now: string): void {
		this.db
			.query("UPDATE pilot_approvals SET consumed_at = ? WHERE opportunity_id = ?")
			.run(now, opportunityId);
	}
}
