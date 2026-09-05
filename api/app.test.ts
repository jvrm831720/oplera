import { describe, expect, test } from "bun:test";
import { app } from "./app.ts";

describe("HTTP app", () => {
	test("exposes a health check", async () => {
		const response = await app.fetch(new Request("http://localhost/health"));

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			status: "ok",
			service: "oplera-revenue",
		});
	});

	test("serves the standalone sales demo", async () => {
		const response = await app.fetch(new Request("http://localhost/demo"));
		const html = await response.text();

		expect(response.status).toBe(200);
		expect(response.headers.get("content-type")).toContain("text/html");
		expect(html).toContain("Oplera Revenue");
		expect(html.length).toBeGreaterThan(100_000);
	});

	test("exposes the MCP endpoint through /api/mcp", async () => {
		const response = await app.fetch(
			new Request("http://localhost/api/mcp", {
				method: "POST",
				headers: {
					accept: "application/json, text/event-stream",
					"content-type": "application/json",
				},
				body: JSON.stringify({
					jsonrpc: "2.0",
					id: 1,
					method: "tools/list",
					params: {},
				}),
			}),
		);

		expect(response.status).not.toBe(404);
	});
});
