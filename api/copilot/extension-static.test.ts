import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const root = join(import.meta.dir, "../../extensions/oplera-copilot");
const fixtureRoot = join(import.meta.dir, "../../tests/fixtures");

async function text(file: string): Promise<string> {
	return readFile(join(root, file), "utf-8");
}

describe("Oplera Copilot Chrome extension", () => {
	test("ships Manifest V3 scoped to WhatsApp Web", async () => {
		const manifest = JSON.parse(await text("manifest.json")) as {
			manifest_version: number;
			name: string;
			host_permissions: string[];
			optional_host_permissions?: string[];
			permissions: string[];
			content_scripts: Array<{ matches: string[] }>;
		};
		expect(manifest.manifest_version).toBe(3);
		expect(manifest.name).toBe("Oplera Copilot");
		expect(manifest.host_permissions).toEqual(["https://web.whatsapp.com/*"]);
		expect(manifest.optional_host_permissions).not.toContain("<all_urls>");
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
			"SUPABASE_PASSWORD",
			"META_APP_SECRET",
		]) {
			expect(source).not.toContain(forbidden);
		}
	});

	test("content script detects the visible title from a synthetic WhatsApp fixture", async () => {
		const source = await text("content.js");
		const fixture = await readFile(
			join(fixtureRoot, "whatsapp-web-conversation.html"),
			"utf-8",
		);
		const fixtureTitle = fixture.match(/title="([^"]+)"/)?.[1];
		expect(fixtureTitle).toBe("Mariana Costa");

		class FakeHTMLElement {
			offsetParent: object | null = {};
			textContent: string;
			private readonly title: string | null;
			constructor(title: string | null, textContent: string) {
				this.title = title;
				this.textContent = textContent;
			}
			getAttribute(name: string) {
				return name === "title" ? this.title : null;
			}
		}
		const titleElement = new FakeHTMLElement(fixtureTitle ?? null, fixtureTitle ?? "");
		const header = {
			querySelectorAll(selector: string) {
				return selector === "[title]" ? [titleElement] : [];
			},
		};
		const documentFixture = {
			title: "Fixture WhatsApp Web",
			querySelector(selector: string) {
				return selector === "header" ? header : null;
			},
		};
		const sandbox: Record<string, unknown> = {};
		const loadDetector = new Function(
			"globalThis",
			"document",
			"HTMLElement",
			"chrome",
			`${source}\nreturn globalThis.OpleraCopilotDetector;`,
		) as (
			globalObject: Record<string, unknown>,
			documentObject: typeof documentFixture,
			htmlElement: typeof FakeHTMLElement,
			chromeObject: undefined,
		) => { detectCurrentConversation(root?: typeof documentFixture): { title: string | null; phone: string | null } };
		const detector = loadDetector(sandbox, documentFixture, FakeHTMLElement, undefined);
		const detected = detector.detectCurrentConversation(documentFixture);
		expect(detected.title).toBe("Mariana Costa");
		expect(detected.phone).toBeNull();
	});

	test("content script does not automate or scrape message history", async () => {
		const source = await text("content.js");
		expect(source).toContain('root.querySelector("header")');
		expect(source).not.toContain("click(");
		expect(source).not.toContain("QR");
		expect(source).not.toContain("message-in");
		expect(source).not.toContain("message-out");
		expect(source).not.toContain("conversation-panel-messages");
	});

	test("side panel declares resolved, ambiguous, not-found and PT-BR error states", async () => {
		const html = await text("sidepanel.html");
		const script = await text("sidepanel.js");
		for (const id of [
			"context-state",
			"ambiguous-state",
			"not-found-state",
			"error-state",
		]) {
			expect(html).toContain(`id="${id}"`);
		}
		expect(html).toContain("Encontramos mais de um contato");
		expect(html).toContain("Contato não encontrado na Oplera");
		expect(html).toContain("Não foi possível carregar o contexto");
		expect(script).toContain("renderContext(context)");
		expect(script).toContain("renderAmbiguous(result.matches, detected)");
		expect(script).toContain('show("notFound")');
		expect(script).toContain("Token do Copilot inválido");
	});

	test("visible extension copy avoids prohibited English interface labels", async () => {
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
			">Blocked<",
			">Allowed<",
			">Requires Approval<",
		]) {
			expect(source).not.toContain(forbidden);
		}
	});
});
