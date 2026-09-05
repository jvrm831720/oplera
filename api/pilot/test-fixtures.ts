import { type PilotConfig, pilotConfigSchema } from "./config.ts";

export function pilotTestConfig(
	overrides: Record<string, string> = {},
): PilotConfig {
	return pilotConfigSchema.parse({
		HUBSPOT_ACCESS_TOKEN: "hubspot-test-token",
		HUBSPOT_DEAL_IDS: "100",
		WHATSAPP_ACCESS_TOKEN: "whatsapp-test-token",
		WHATSAPP_PHONE_NUMBER_ID: "123456789",
		WHATSAPP_VERIFY_TOKEN: "verify-token-123456",
		WHATSAPP_APP_SECRET: "app-secret-123456789",
		WHATSAPP_GRAPH_VERSION: "v99.0",
		WHATSAPP_TEMPLATE_NAME: "oplera_recovery_reactivation",
		PILOT_PHONE_ALLOWLIST: "+5511999999999",
		PILOT_DRY_RUN: "true",
		PILOT_KILL_SWITCH: "true",
		PILOT_ADMIN_TOKEN: "12345678901234567890123456789012",
		PILOT_STATE_DB_PATH: ":memory:",
		...overrides,
	});
}

export function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json" },
	});
}

export function hubSpotFixtureFetch(requestLog: string[] = []): typeof fetch {
	return (async (input: RequestInfo | URL, init?: RequestInit) => {
		const url =
			typeof input === "string"
				? input
				: input instanceof URL
					? input.toString()
					: input.url;
		requestLog.push(`${init?.method ?? "GET"} ${url}`);
		if (
			url.includes("/crm/v3/objects/deals/100?") &&
			(init?.method ?? "GET") === "GET"
		) {
			return jsonResponse({
				id: "100",
				createdAt: "2026-08-01T12:00:00.000Z",
				updatedAt: "2026-09-01T12:00:00.000Z",
				properties: {
					dealname: "ACME expansion",
					dealstage: "appointmentscheduled",
					pipeline: "default",
					amount: "12000",
					hubspot_owner_id: "owner-1",
					oplera_recovery_status: "discovered",
					oplera_recovery_attempts: "0",
					oplera_active_human_conversation: "false",
					closed_lost_reason: "timing",
				},
				associations: {
					contacts: { results: [{ id: "200" }] },
					companies: { results: [{ id: "300" }] },
					notes: { results: [{ id: "400" }] },
					calls: { results: [] },
					emails: { results: [] },
					meetings: { results: [] },
				},
			});
		}
		if (
			url.includes("/crm/v3/objects/deals/100?") &&
			url.includes("oplera_recovery_attempts")
		) {
			return jsonResponse({
				id: "100",
				properties: { oplera_recovery_attempts: "0" },
			});
		}
		if (url.includes("/crm/v3/objects/contacts/batch/read")) {
			return jsonResponse({
				results: [
					{
						id: "200",
						properties: {
							firstname: "Marina",
							lastname: "Silva",
							email: "marina@example.com",
							phone: "+5511999999999",
							mobilephone: "+5511999999999",
						},
					},
				],
			});
		}
		if (url.includes("/crm/v3/objects/companies/batch/read")) {
			return jsonResponse({
				results: [{ id: "300", properties: { name: "ACME" } }],
			});
		}
		if (url.includes("/crm/v3/objects/notes/batch/read")) {
			return jsonResponse({
				results: [
					{
						id: "400",
						updatedAt: "2026-09-01T11:00:00.000Z",
						properties: {
							hs_timestamp: "2026-09-01T11:00:00.000Z",
							hs_note_body:
								"Proposta enviada. Cliente pediu para retomar em setembro.",
						},
					},
				],
			});
		}
		if (
			url.includes("/crm/v3/objects/calls/batch/read") ||
			url.includes("/crm/v3/objects/emails/batch/read") ||
			url.includes("/crm/v3/objects/meetings/batch/read")
		) {
			return jsonResponse({ results: [] });
		}
		if (url.endsWith("/crm/v3/objects/notes") && init?.method === "POST") {
			return jsonResponse(
				{ id: `note-${requestLog.length}`, properties: {} },
				201,
			);
		}
		if (url.includes("/crm/v3/objects/deals/100") && init?.method === "PATCH") {
			return jsonResponse({ id: "100", properties: {} });
		}
		return jsonResponse({ message: `Unhandled test URL ${url}` }, 500);
	}) as typeof fetch;
}
