import { z } from "zod";

const csvList = z
	.string()
	.transform((value) =>
		value
			.split(",")
			.map((item) => item.trim())
			.filter(Boolean),
	)
	.pipe(z.array(z.string().min(1)).min(1));

function envBoolean(defaultValue: boolean) {
	return z.preprocess((value) => {
		if (value === undefined || value === "") return defaultValue;
		if (typeof value === "string") return value.toLowerCase() === "true";
		return value;
	}, z.boolean());
}

export const pilotConfigSchema = z.object({
	HUBSPOT_ACCESS_TOKEN: z.string().min(1),
	HUBSPOT_DEAL_IDS: csvList,
	HUBSPOT_RECOVERY_STATUS_PROPERTY: z
		.string()
		.regex(/^[a-zA-Z0-9_]+$/)
		.default("oplera_recovery_status"),
	HUBSPOT_RECOVERY_ATTEMPTS_PROPERTY: z
		.string()
		.regex(/^[a-zA-Z0-9_]+$/)
		.default("oplera_recovery_attempts"),
	HUBSPOT_ACTIVE_HUMAN_PROPERTY: z
		.string()
		.regex(/^[a-zA-Z0-9_]+$/)
		.default("oplera_active_human_conversation"),
	HUBSPOT_LOST_REASON_PROPERTY: z
		.string()
		.regex(/^[a-zA-Z0-9_]+$/)
		.default("closed_lost_reason"),
	HUBSPOT_NOTE_TO_DEAL_ASSOCIATION_TYPE_ID: z.coerce
		.number()
		.int()
		.positive()
		.default(214),
	WHATSAPP_ACCESS_TOKEN: z.string().min(1),
	WHATSAPP_PHONE_NUMBER_ID: z.string().min(1),
	WHATSAPP_VERIFY_TOKEN: z.string().min(16),
	WHATSAPP_APP_SECRET: z.string().min(16),
	WHATSAPP_GRAPH_VERSION: z.string().regex(/^v\d+\.\d+$/),
	WHATSAPP_TEMPLATE_NAME: z.string().min(1),
	WHATSAPP_TEMPLATE_LANGUAGE: z.string().min(2).default("pt_BR"),
	PILOT_PHONE_ALLOWLIST: csvList,
	PILOT_DRY_RUN: envBoolean(true),
	PILOT_KILL_SWITCH: envBoolean(true),
	PILOT_ADMIN_TOKEN: z.string().min(32),
	PILOT_STATE_DB_PATH: z.string().min(1).default(".oplera/pilot-state.sqlite"),
});

export type PilotConfig = z.infer<typeof pilotConfigSchema>;

export function loadPilotConfig(
	env: Record<string, string | undefined> = process.env,
): PilotConfig {
	return pilotConfigSchema.parse(env);
}

export function normalizePhone(value: string): string {
	const trimmed = value.trim();
	const digits = trimmed.replace(/\D/g, "");
	return digits ? `+${digits}` : "";
}
