import type { Conversation } from "./recovery.ts";

export const CSV_COLUMNS = [
	"conversation_id",
	"contact_name",
	"phone",
	"owner",
	"source",
	"estimated_value",
	"direction",
	"message",
	"timestamp",
] as const;

function parseCsvRows(csv: string): string[][] {
	const rows: string[][] = [];
	let row: string[] = [];
	let field = "";
	let quoted = false;

	for (let index = 0; index < csv.length; index += 1) {
		const char = csv[index];
		const next = csv[index + 1];
		if (char === '"' && quoted && next === '"') {
			field += '"';
			index += 1;
		} else if (char === '"') {
			quoted = !quoted;
		} else if (char === "," && !quoted) {
			row.push(field.trim());
			field = "";
		} else if ((char === "\n" || char === "\r") && !quoted) {
			if (char === "\r" && next === "\n") index += 1;
			row.push(field.trim());
			if (row.some(Boolean)) rows.push(row);
			row = [];
			field = "";
		} else {
			field += char;
		}
	}
	row.push(field.trim());
	if (row.some(Boolean)) rows.push(row);
	return rows;
}

function normalizeHeader(header: string): string {
	return header
		.trim()
		.toLowerCase()
		.replace(/[\s-]+/g, "_");
}

export function parseConversationCsv(csv: string): Conversation[] {
	const rows = parseCsvRows(csv.replace(/^\uFEFF/, ""));
	const headerRow = rows.shift();
	if (!headerRow) throw new Error("O CSV está vazio.");
	const headers = headerRow.map(normalizeHeader);
	const missing = CSV_COLUMNS.filter((column) => !headers.includes(column));
	if (missing.length > 0) {
		throw new Error(`Colunas obrigatórias ausentes: ${missing.join(", ")}.`);
	}

	const grouped = new Map<string, Conversation>();
	for (const [rowIndex, values] of rows.entries()) {
		const record = Object.fromEntries(
			headers.map((header, index) => [header, values[index] ?? ""]),
		);
		const id = record.conversation_id;
		const contactName = record.contact_name;
		const direction = record.direction;
		const message = record.message;
		const timestamp = record.timestamp;
		if (!id || !contactName || !message || !timestamp) {
			throw new Error(
				`Linha ${rowIndex + 2} contém campos obrigatórios vazios.`,
			);
		}
		if (direction !== "inbound" && direction !== "outbound") {
			throw new Error(
				`Linha ${rowIndex + 2}: direction deve ser inbound ou outbound.`,
			);
		}
		if (Number.isNaN(Date.parse(timestamp))) {
			throw new Error(`Linha ${rowIndex + 2}: timestamp inválido.`);
		}

		const estimatedValue = record.estimated_value
			? Number(record.estimated_value.replace(",", "."))
			: undefined;
		if (estimatedValue !== undefined && !Number.isFinite(estimatedValue)) {
			throw new Error(`Linha ${rowIndex + 2}: estimated_value inválido.`);
		}

		const existing = grouped.get(id);
		if (existing) {
			existing.messages.push({ direction, text: message, timestamp });
			continue;
		}
		grouped.set(id, {
			id,
			contactName,
			phone: record.phone || undefined,
			owner: record.owner || undefined,
			source: record.source || undefined,
			estimatedValue,
			messages: [{ direction, text: message, timestamp }],
		});
	}

	return [...grouped.values()];
}
