import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { loadCopilotConfig, type CopilotConfig } from "./config.ts";
import {
	getSellerCopilotRuntime,
	type SellerCopilotRuntime,
} from "./runtime.ts";

const resolveSchema = z
	.object({
		phone: z.string().trim().min(3).max(80).optional(),
		name: z.string().trim().min(2).max(200).optional(),
		email: z.string().trim().email().max(320).optional(),
		company: z.string().trim().min(2).max(200).optional(),
		query: z.string().trim().min(2).max(200).optional(),
	})
	.refine((value) => Object.values(value).some(Boolean), {
		message: "copilot_resolution_query_required",
	});

export interface CopilotHttpDependencies {
	config?: CopilotConfig;
	runtime?: SellerCopilotRuntime;
}

function constantTimeEqual(left: string, right: string): boolean {
	const a = Buffer.from(left);
	const b = Buffer.from(right);
	return a.length === b.length && timingSafeEqual(a, b);
}

function authorized(req: Request, token: string): boolean {
	const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
	return constantTimeEqual(bearer, token);
}

function originHeaders(req: Request, config: CopilotConfig): Headers | null {
	const origin = req.headers.get("origin")?.replace(/\/$/, "");
	const headers = new Headers({ vary: "Origin" });
	if (!origin) return headers;
	if (!config.COPILOT_ALLOWED_ORIGINS.includes(origin)) return null;
	headers.set("access-control-allow-origin", origin);
	headers.set("access-control-allow-methods", "GET,POST,OPTIONS");
	headers.set("access-control-allow-headers", "Authorization,Content-Type");
	headers.set("access-control-max-age", "600");
	return headers;
}

function json(body: unknown, status: number, headers: Headers): Response {
	const output = new Headers(headers);
	output.set("content-type", "application/json; charset=utf-8");
	return new Response(JSON.stringify(body), { status, headers: output });
}

async function readJson(req: Request): Promise<unknown> {
	const body = await req.text();
	return body ? JSON.parse(body) : {};
}

export async function handleSellerCopilotHttp(
	req: Request,
	dependencies: CopilotHttpDependencies = {},
): Promise<Response | null> {
	const url = new URL(req.url);
	if (!url.pathname.startsWith("/api/v0.5/copilot/")) return null;

	let config: CopilotConfig;
	try {
		config = dependencies.config ?? loadCopilotConfig();
	} catch {
		return Response.json(
			{ error: "copilot_configuration_invalid" },
			{ status: 503 },
		);
	}
	const cors = originHeaders(req, config);
	if (!cors)
		return Response.json({ error: "copilot_origin_not_allowed" }, { status: 403 });
	if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
	if (!authorized(req, config.COPILOT_ACCESS_TOKEN))
		return json({ error: "unauthorized" }, 401, cors);

	let runtime: SellerCopilotRuntime;
	try {
		runtime = dependencies.runtime ?? getSellerCopilotRuntime();
	} catch {
		return json({ error: "copilot_runtime_unavailable" }, 503, cors);
	}

	if (req.method === "GET" && url.pathname === "/api/v0.5/copilot/health") {
		return json(
			{
				status: "ok",
				version: "0.5",
				product: "seller_copilot",
				service_model: "managed_service",
				crm: "hubspot",
				messaging: "whatsapp",
				persistence: runtime.persistenceBackend,
			},
			200,
			cors,
		);
	}

	if (req.method === "POST" && url.pathname === "/api/v0.5/copilot/resolve") {
		try {
			const parsed = resolveSchema.safeParse(await readJson(req));
			if (!parsed.success)
				return json(
					{ error: "invalid_resolution_query", issues: parsed.error.issues },
					422,
					cors,
				);
			return json(await runtime.resolve(parsed.data), 200, cors);
		} catch {
			return json({ error: "copilot_resolution_failed" }, 500, cors);
		}
	}

	const contextMatch = url.pathname.match(/^\/api\/v0\.5\/copilot\/context\/([^/]+)$/);
	if (req.method === "GET" && contextMatch) {
		const opportunityId = decodeURIComponent(contextMatch[1] ?? "");
		try {
			return json(await runtime.context(opportunityId), 200, cors);
		} catch (error) {
			const message = error instanceof Error ? error.message : "unknown_error";
			return json(
				{ error: message === "copilot_context_not_found" ? message : "copilot_context_failed" },
				message === "copilot_context_not_found" ? 404 : 500,
				cors,
			);
		}
	}

	return json({ error: "not_found" }, 404, cors);
}
