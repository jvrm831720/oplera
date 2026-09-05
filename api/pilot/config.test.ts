import { describe, expect, test } from "bun:test";
import { normalizePhone, pilotConfigSchema } from "./config.ts";

const env = {
	HUBSPOT_ACCESS_TOKEN: "hubspot-token",
	HUBSPOT_DEAL_IDS: "100, 101",
	WHATSAPP_ACCESS_TOKEN: "wa-token",
	WHATSAPP_PHONE_NUMBER_ID: "123",
	WHATSAPP_VERIFY_TOKEN: "verify-token-123456",
	WHATSAPP_APP_SECRET: "app-secret-123456789",
	WHATSAPP_GRAPH_VERSION: "v99.0",
	WHATSAPP_TEMPLATE_NAME: "oplera_recovery_reactivation",
	PILOT_PHONE_ALLOWLIST: "+55 11 99999-9999,+5521999999999",
	PILOT_ADMIN_TOKEN: "12345678901234567890123456789012",
};

describe("pilot configuration", () => {
	test("defaults to dry-run and kill switch enabled", () => {
		const config = pilotConfigSchema.parse(env);
		expect(config.PILOT_DRY_RUN).toBe(true);
		expect(config.PILOT_KILL_SWITCH).toBe(true);
		expect(config.HUBSPOT_DEAL_IDS).toEqual(["100", "101"]);
	});

	test("normalizes phone allowlist values", () => {
		expect(normalizePhone("+55 (11) 99999-9999")).toBe("+5511999999999");
	});

	test("rejects a missing admin token", () => {
		const parsed = pilotConfigSchema.safeParse({
			...env,
			PILOT_ADMIN_TOKEN: "short",
		});
		expect(parsed.success).toBe(false);
	});
});
