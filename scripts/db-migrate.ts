import { readdirSync } from "node:fs";
import { join } from "node:path";
import { createDatabaseClient, requireDatabaseUrl } from "../api/db/client.ts";

const databaseUrl = requireDatabaseUrl();
const sql = createDatabaseClient(databaseUrl);
const migrationsDirectory = join(import.meta.dir, "..", "db", "migrations");

try {
	await sql`CREATE SCHEMA IF NOT EXISTS oplera`;
	await sql`
		CREATE TABLE IF NOT EXISTS oplera.schema_migrations (
			version TEXT PRIMARY KEY,
			applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
		)
	`;

	const files = readdirSync(migrationsDirectory)
		.filter((file) => /^\d+_.+\.sql$/.test(file))
		.sort();

	for (const file of files) {
		const applied = await sql<{ version: string }[]>`
			SELECT version
			FROM oplera.schema_migrations
			WHERE version = ${file}
		`;
		if (applied.length > 0) continue;

		await sql.begin(async (tx) => {
			await tx.file(join(migrationsDirectory, file));
			await tx`
				INSERT INTO oplera.schema_migrations (version)
				VALUES (${file})
			`;
		});
		console.log(`applied migration ${file}`);
	}
} finally {
	await sql.close();
}
