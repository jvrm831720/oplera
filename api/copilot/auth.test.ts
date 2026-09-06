import { describe, expect, test } from "bun:test";
import type { RevenueContextService } from "./revenue-context-service.ts";
import { handleSellerCopilotHttp } from "./http.ts";
import { SellerCopilotRuntime } from "./runtime.ts";
import type { CopilotConfig } from "./config.ts";

const validToken = "12345678901234567890123456789012";
const origin = "chrome-extension://abcdefghijklmnop";
const config: CopilotConfig = {
	COPILOT_ACCESS_TOKEN: validToken,
	COPILOT_ALLOWED_ORIGINS: [origin],
};
const runtime = new SellerCopilotRuntime(
	config,
	{} as RevenueContextService,
	"limited",
);

function request(token?: string) {
	return new Request("http://localhost/api/v0.5/copilot/health", {
		headers: {
			origin,
			...(token ? { authorization: `Bearer ${token}` } : {}),
		},
	});
}

describe("Seller Copilot pilot auth", () => {
	test("sem token retorna 401", async () => {
		const response = await handleSellerCopilotHttp(request(), { config, runtime });
		expect(response?.status).toBe(401);
	});

	test("token inválido retorna 401", async () => {
		const response = await handleSellerCopilotHttp(
			request("00000000000000000000000000000000"),
			{ config, runtime },
		);
		expect(response?.status).toBe(401);
	});

	test("token válido retorna health seguro sem ecoar credenciais", async () => {
		const response = await handleSellerCopilotHttp(request(validToken), {
			config,
			runtime,
		});
		expect(response?.status).toBe(200);
		const bodyText = await response?.text();
		expect(bodyText).not.toContain(validToken);
		expect(bodyText).not.toContain("DATABASE_URL");
		expect(bodyText).not.toContain("HUBSPOT_ACCESS_TOKEN");
	});
});
