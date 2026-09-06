import { SQL } from "bun";

export type DatabaseClient = SQL;

export function requireDatabaseUrl(
	env: Record<string, string | undefined> = process.env,
): string {
	const value = env.DATABASE_URL?.trim();
	if (!value) throw new Error("database_url_required");
	if (!/^postgres(?:ql)?:\/\//i.test(value))
		throw new Error("database_url_must_be_postgres");
	return value;
}

export function createDatabaseClient(databaseUrl: string): DatabaseClient {
	if (!/^postgres(?:ql)?:\/\//i.test(databaseUrl))
		throw new Error("database_url_must_be_postgres");
	return new SQL(databaseUrl);
}

export function shouldUsePostgres(
	env: Record<string, string | undefined> = process.env,
): boolean {
	if (env.DATABASE_URL?.trim()) return true;
	if (env.NODE_ENV === "production") throw new Error("database_url_required");
	return false;
}

export async function checkDatabase(client: DatabaseClient): Promise<boolean> {
	const rows = await client<{ ok: number }[]>`SELECT 1 AS ok`;
	return rows[0]?.ok === 1;
}
