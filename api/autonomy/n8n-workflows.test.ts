import { describe, expect, test } from "bun:test";
import { readdir, readFile } from "node:fs/promises";

interface WorkflowExport {
	name: string;
	nodes: Array<{ name: string; type: string }>;
	connections: Record<string, unknown>;
	active: boolean;
}

describe("n8n workflow exports", () => {
	test("ships nine valid disabled workflow exports without credentials", async () => {
		const directory = new URL("../../n8n/workflows/", import.meta.url);
		const files = (await readdir(directory)).filter((name) => name.endsWith(".json"));
		expect(files).toHaveLength(9);

		for (const file of files) {
			const raw = await readFile(new URL(file, directory), "utf8");
			const workflow = JSON.parse(raw) as WorkflowExport;
			expect(workflow.name.startsWith("Oplera ")).toBe(true);
			expect(workflow.nodes.length).toBeGreaterThanOrEqual(2);
			expect(workflow.connections).toBeDefined();
			expect(workflow.active).toBe(false);
			expect(raw).not.toMatch(/api[_-]?key|authorization\s*:\s*bearer|client_secret/i);
		}
	});
});
