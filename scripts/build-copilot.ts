import { cp, mkdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const source = join(root, "extensions", "oplera-copilot");
const target = join(root, "dist", "oplera-copilot");

await rm(target, { recursive: true, force: true });
await mkdir(join(root, "dist"), { recursive: true });
await cp(source, target, { recursive: true });

const manifest = JSON.parse(
	await readFile(join(target, "manifest.json"), "utf-8"),
) as { manifest_version?: number; name?: string };

if (manifest.manifest_version !== 3 || manifest.name !== "Oplera Copilot") {
	throw new Error("copilot_extension_manifest_invalid");
}

console.log(`Extensão Oplera Copilot gerada em ${target}`);
