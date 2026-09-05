import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { pilotConfigSchema } from "./config.ts";
import { pilotLog } from "./logger.ts";
import { getPilotRuntime } from "./runtime.ts";
import { parseWhatsAppWebhook } from "./whatsapp.ts";

const approvalSchema = z.object({
	approved_by: z.string().trim().min(1).max(200),
});

function constantTimeEqual(left: string, right: string): boolean {
	const a = Buffer.from(left);
	const b = Buffer.from(right);
	return a.length === b.length && timingSafeEqual(a, b);
}

function authorized(req: Request, token: string): boolean {
	const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
	const explicit = req.headers.get("x-oplera-pilot-admin-token");
	const provided = bearer || explicit || "";
	return constantTimeEqual(provided, token);
}

async function readJson(req: Request): Promise<unknown> {
	const text = await req.text();
	return text ? JSON.parse(text) : {};
}

function configurationError(error: unknown): Response {
	pilotLog("error", "pilot_configuration_invalid", {
		error: error instanceof Error ? error.message : "unknown_error",
	});
	return Response.json(
		{
			error: "pilot_configuration_invalid",
			detail: "Check server environment variables.",
		},
		{ status: 503 },
	);
}

export async function handlePilotHttp(req: Request): Promise<Response | null> {
	const url = new URL(req.url);
	if (!url.pathname.startsWith("/api/v0.4.1/pilot/")) return null;

	let runtime: ReturnType<typeof getPilotRuntime>;
	try {
		runtime = getPilotRuntime();
	} catch (error) {
		return configurationError(error);
	}

	if (req.method === "GET" && url.pathname === "/api/v0.4.1/pilot/health") {
		return Response.json({
			status: "ok",
			version: "0.4.1",
			crm: "hubspot",
			messaging: "whatsapp_cloud_api",
			dry_run: runtime.config.PILOT_DRY_RUN,
			kill_switch: runtime.config.PILOT_KILL_SWITCH,
			allowlisted_deals: runtime.config.HUBSPOT_DEAL_IDS.length,
			allowlisted_phones: runtime.config.PILOT_PHONE_ALLOWLIST.length,
		});
	}

	if (url.pathname === "/api/v0.4.1/pilot/webhooks/whatsapp") {
		if (req.method === "GET") {
			const challenge = runtime.whatsapp.verifyWebhookChallenge(url);
			return challenge === null
				? new Response("Forbidden", { status: 403 })
				: new Response(challenge, { status: 200 });
		}
		if (req.method === "POST") {
			const rawBody = await req.text();
			if (
				!runtime.whatsapp.verifyWebhookSignature(
					rawBody,
					req.headers.get("x-hub-signature-256"),
				)
			) {
				return Response.json(
					{ error: "invalid_webhook_signature" },
					{ status: 401 },
				);
			}
			try {
				const messages = parseWhatsAppWebhook(rawBody);
				const results = [];
				for (const message of messages)
					results.push(await runtime.handleIncoming(message));
				return Response.json({ received: true, processed: results });
			} catch (error) {
				pilotLog("error", "whatsapp_webhook_processing_failed", {
					error: error instanceof Error ? error.message : "unknown_error",
				});
				return Response.json(
					{ error: "webhook_processing_failed" },
					{ status: 500 },
				);
			}
		}
	}

	if (!authorized(req, runtime.config.PILOT_ADMIN_TOKEN)) {
		return Response.json({ error: "unauthorized" }, { status: 401 });
	}

	if (
		req.method === "GET" &&
		url.pathname === "/api/v0.4.1/pilot/opportunities"
	) {
		return Response.json({ data: await runtime.listOpportunities() });
	}

	const match = url.pathname.match(
		/^\/api\/v0\.4\.1\/pilot\/opportunities\/([^/]+)\/(preview|approve|execute)$/,
	);
	if (!match) return null;
	const opportunityId = decodeURIComponent(match[1] ?? "");
	const action = match[2];

	try {
		if (req.method === "GET" && action === "preview") {
			return Response.json(await runtime.preview(opportunityId));
		}
		if (req.method === "POST" && action === "approve") {
			const parsed = approvalSchema.safeParse(await readJson(req));
			if (!parsed.success) {
				return Response.json(
					{ error: "invalid_approval", issues: parsed.error.issues },
					{ status: 422 },
				);
			}
			return Response.json(
				await runtime.approve(opportunityId, parsed.data.approved_by),
			);
		}
		if (req.method === "POST" && action === "execute") {
			return Response.json(await runtime.execute(opportunityId));
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : "unknown_error";
		const status =
			message === "opportunity_not_found"
				? 404
				: message.includes("approval_required")
					? 409
					: 400;
		pilotLog(status >= 500 ? "error" : "warn", "pilot_request_failed", {
			action,
			opportunity_id: opportunityId,
			error: message,
		});
		return Response.json({ error: message }, { status });
	}
	return null;
}

export function validatePilotEnvironment(
	env: Record<string, string | undefined>,
) {
	return pilotConfigSchema.safeParse(env);
}
