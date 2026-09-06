import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const root = join(import.meta.dir, "../../extensions/oplera-copilot");

async function text(file: string): Promise<string> {
	return readFile(join(root, file), "utf-8");
}

describe("Oplera Copilot Chrome extension", () => {
	test("ships Manifest V3 scoped to WhatsApp Web", async () => {
		const manifest = JSON.parse(await text("manifest.json")) as {
			manifest_version: number;
			name: string;
			host_permissions: string[];
			permissions: string[];
			content_scripts: Array<{ matches: string[] }>;
		};
		expect(manifest.manifest_version).toBe(3);
		expect(manifest.name).toBe("Oplera Copilot");
		expect(manifest.host_permissions).toEqual(["https://web.whatsapp.com/*"]);
		expect(manifest.permissions).not.toContain("webRequest");
		expect(manifest.content_scripts[0]?.matches).toEqual([
			"https://web.whatsapp.com/*",
		]);
	});

	test("never embeds provider or database secrets", async () => {
		const files = [
			"manifest.json",
			"service-worker.js",
			"content.js",
			"sidepanel.html",
			"sidepanel.js",
			"options.html",
			"options.js",
		];
		const source = (await Promise.all(files.map(text))).join("\n");
		for (const forbidden of [
			"HUBSPOT_ACCESS_TOKEN",
			"WHATSAPP_ACCESS_TOKEN",
			"DATABASE_URL",
			"SUPABASE_SERVICE_ROLE",
			"META_APP_SECRET",
		]) {
			expect(source).not.toContain(forbidden);
		}
	});

	test("content script only reads minimal visible header context", async () => {
		const source = await text("content.js");
		expect(source).toContain('document.querySelector("header")');
		expect(source).not.toContain("click(");
		expect(source).not.toContain("QR");
		expect(source).not.toContain("message-in");
		expect(source).not.toContain("message-out");
		expect(source).not.toContain("conversation-panel-messages");
	});

	test("visible extension copy avoids known English interface labels", async () => {
		const source = `${await text("sidepanel.html")}\n${await text("options.html")}`;
		for (const forbidden of [
			">Overview<",
			">Recovery Queue<",
			">Next Best Action<",
			">Policies<",
			">Activity<",
			">Demo Mode<",
			">Search<",
			">Refresh<",
			">Retry<",
			">Loading<",
		]) {
			expect(source).not.toContain(forbidden);
		}
	});
});
