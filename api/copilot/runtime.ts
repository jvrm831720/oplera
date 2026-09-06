import {
	createDatabaseClient,
	requireDatabaseUrl,
	shouldUsePostgres,
} from "../db/client.ts";
import { getPilotRuntime } from "../pilot/runtime.ts";
import { type CopilotConfig, loadCopilotConfig } from "./config.ts";
import {
	NullInternalRevenueContextReader,
	PostgresInternalRevenueContextReader,
} from "./internal-context.ts";
import { RevenueContextService } from "./revenue-context-service.ts";
import type {
	CopilotResolveInput,
	CopilotResolveResult,
	SellerCopilotContext,
} from "./types.ts";

export class SellerCopilotRuntime {
	constructor(
		readonly config: CopilotConfig,
		readonly contexts: RevenueContextService,
		readonly persistenceBackend: "postgres" | "limited",
	) {}

	async resolve(input: CopilotResolveInput): Promise<CopilotResolveResult> {
		return this.contexts.resolve(input);
	}

	async context(opportunityId: string): Promise<SellerCopilotContext> {
		return this.contexts.getContext(opportunityId);
	}
}

let singleton: SellerCopilotRuntime | null = null;

export function getSellerCopilotRuntime(): SellerCopilotRuntime {
	if (singleton) return singleton;
	const config = loadCopilotConfig();
	const pilot = getPilotRuntime();
	if (shouldUsePostgres()) {
		const sql = createDatabaseClient(requireDatabaseUrl());
		const reader = new PostgresInternalRevenueContextReader(sql);
		singleton = new SellerCopilotRuntime(
			config,
			new RevenueContextService(pilot.hubspot, reader, config),
			"postgres",
		);
		return singleton;
	}
	const reader = new NullInternalRevenueContextReader();
	singleton = new SellerCopilotRuntime(
		config,
		new RevenueContextService(pilot.hubspot, reader, config),
		"limited",
	);
	return singleton;
}
