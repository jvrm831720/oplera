import { describe, expect, test } from "bun:test";
import { type CopilotConfig, copilotConfigSchema } from "./config.ts";
import { handleSellerCopilotHttp } from "./http.ts";
import type { RevenueContextService } from "./revenue-context-service.ts";
import { SellerCopilotRuntime } from "./runtime.ts";

const token = "12345678901234567890123456789012";
const origin = "chrome-extension://abcdefghijklmnop";
const config: CopilotConfig = {
	COPILOT_ACCESS_TOKEN: token,
	COPILOT_ALLOWED_ORIGINS: [origin],
};
const runtime = new SellerCopilotRuntime(
	config,
	{} as RevenueContextService,
	"limited",
);

describe("Seller Copilot HTTP", () => {
	test("rejeita wildcard na configuração CORS", () => {
		const parsed = copilotConfigSchema.safeParse({
			COPILOT_ACCESS_TOKEN: token,
			COPILOT_ALLOWED_ORIGINS: "*",
		});
		expect(parsed.success).toBe(false);
	});

	test("responde preflight apenas para origin allowlisted", async () => {
		const response = await handleSellerCopilotHttp(
			new Request("http://localhost/api/v0.5/copilot/health", {
				method: "OPTIONS",
				headers: { origin },
			}),
			{ config, runtime },
		);
		expect(response?.status).toBe(204);
		expect(response?.headers.get("access-control-allow-origin")).toBe(origin);
	});

	test("bloqueia origin não autorizado", async () => {
		const response = await handleSellerCopilotHttp(
			new Request("http://localhost/api/v0.5/copilot/health", {
				headers: {
					origin: "chrome-extension://not-allowed",
					authorization: `Bearer ${token}`,
				},
			}),
			{ config, runtime },
		);
		expect(response?.status).toBe(403);
		expect(response?.headers.get("access-control-allow-origin")).toBeNull();
	});

	test("exige bearer token e protege health", async () => {
		const unauthorized = await handleSellerCopilotHttp(
			new Request("http://localhost/api/v0.5/copilot/health", {
				headers: { origin },
			}),
			{ config, runtime },
		);
		expect(unauthorized?.status).toBe(401);

		const authorized = await handleSellerCopilotHttp(
			new Request("http://localhost/api/v0.5/copilot/health", {
				headers: { origin, authorization: `Bearer ${token}` },
			}),
			{ config, runtime },
		);
		expect(authorized?.status).toBe(200);
		expect(authorized?.headers.get("access-control-allow-origin")).toBe(origin);
		const body = await authorized?.json();
		expect(body?.service_model).toBe("managed_service");
	});
});
