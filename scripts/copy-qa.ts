import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative } from "node:path";

const root = join(import.meta.dir, "..");
const roots = [join(root, "web"), join(root, "extensions")];
const extensions = new Set([".tsx", ".ts", ".jsx", ".js", ".html"]);
const forbidden = [
	"Overview",
	"Recovery Queue",
	"Opportunities",
	"Conversations",
	"Policies",
	"Activity",
	"Recoverable",
	"Contacted",
	"Engaged",
	"Recovered",
	"Agent Focus",
	"Due Now",
	"Scheduled",
	"Processing",
	"Awaiting Reply",
	"Demo Mode",
	"Generated",
	"Running",
	"Next Best Action",
	"Lead Context",
	"Last Signals",
	"Why Now",
	"Evidence",
	"Blocked",
	"Allowed",
	"Requires Approval",
];
const genericVisibleEnglish = ["Close", "Search", "Refresh", "Retry", "Loading"];

async function files(directory: string): Promise<string[]> {
	const result: string[] = [];
	for (const entry of await readdir(directory, { withFileTypes: true })) {
		const path = join(directory, entry.name);
		if (entry.isDirectory()) result.push(...(await files(path)));
		else if (extensions.has(extname(path))) result.push(path);
	}
	return result;
}

function userFacingPatterns(value: string): RegExp[] {
	const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	return [
		new RegExp(`["']${escaped}["']`),
		new RegExp(`>\\s*${escaped}\\s*<`),
		new RegExp(`(?:aria-label|title|placeholder)=["'][^"']*\\b${escaped}\\b`, "i"),
	];
}

const failures: string[] = [];
for (const directory of roots) {
	for (const path of await files(directory)) {
		const rel = relative(root, path);
		const source = await readFile(path, "utf-8");
		for (const value of [...forbidden, ...genericVisibleEnglish]) {
			if (userFacingPatterns(value).some((pattern) => pattern.test(source))) {
				failures.push(`${rel}: texto user-facing em inglês encontrado: ${value}`);
			}
		}
		if (/>(?:[^<>]*\s)?outbound(?:\s[^<>]*)?</i.test(source)) {
			failures.push(`${rel}: termo user-facing "outbound" deve ser traduzido`);
		}
	}
}

if (failures.length) {
	console.error(failures.join("\n"));
	process.exit(1);
}

console.log("Copy QA PT-BR: nenhuma string proibida encontrada em web/ e extensions/.");
