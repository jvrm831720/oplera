import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createPublicResource } from "@decocms/runtime/tools";
import { RECOVERY_RESOURCE_URI } from "../tools/analyze-recovery.ts";
import type { Env } from "../types/env.ts";

const RESOURCE_MIME_TYPE = "text/html;profile=mcp-app";

function getDistPath(): string {
	return join(import.meta.dir, "../..", "dist", "client", "index.html");
}

export async function readRecoveryAppHtml(): Promise<string> {
	return readFile(getDistPath(), "utf-8");
}

export const recoveryAppResource = (_env: Env) =>
	createPublicResource({
		uri: RECOVERY_RESOURCE_URI,
		name: "Oplera Revenue Recovery",
		description: "Painel interativo de oportunidades comerciais recuperáveis.",
		mimeType: RESOURCE_MIME_TYPE,
		read: async () => ({
			uri: RECOVERY_RESOURCE_URI,
			mimeType: RESOURCE_MIME_TYPE,
			text: await readRecoveryAppHtml(),
		}),
	});
