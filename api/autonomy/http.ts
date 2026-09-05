import { z } from "zod";
import { getDemoRecoveryRuntime } from "./demo-runtime.ts";

const replySchema = z.object({
	opportunity_id: z.string().min(1),
	text: z.string().trim().min(1).max(4_000),
	timestamp: z.iso.datetime().optional(),
});

const agentStepSchema = z.object({
	step: z.enum([
		"discovery",
		"analysis",
		"planner",
		"policy",
		"outreach",
		"incoming_reply",
		"conversation",
		"handoff",
		"dispatch",
	]),
	reference_date: z.iso.datetime().optional(),
});

const dispatchSchema = z.object({
	reference_date: z.iso.datetime().optional(),
});

const rateBuckets = new Map<string, { startedAt: number; count: number }>();
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 120;

function rateLimit(req: Request, path: string): Response | null {
	const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
	const key = `${forwarded ?? "local"}:${path}`;
	const now = Date.now();
	const current = rateBuckets.get(key);
	if (!current || now - current.startedAt >= RATE_WINDOW_MS) {
		rateBuckets.set(key, { startedAt: now, count: 1 });
		return null;
	}
	current.count += 1;
	if (current.count <= RATE_LIMIT) return null;
	return Response.json(
		{ error: "rate_limited", retry_after_seconds: 60 },
		{ status: 429, headers: { "retry-after": "60" } },
	);
}

async function readJson(req: Request): Promise<unknown> {
	const text = await req.text();
	return text ? JSON.parse(text) : {};
}

export async function handleAutonomyHttp(
	req: Request,
): Promise<Response | null> {
	const url = new URL(req.url);
	if (!url.pathname.startsWith("/api/v0.4/")) return null;

	const limited = rateLimit(req, url.pathname);
	if (limited) return limited;

	const runtime = getDemoRecoveryRuntime();
	if (req.method === "GET" && url.pathname === "/api/v0.4/operator-console") {
		return Response.json(await runtime.snapshot());
	}

	if (req.method === "POST" && url.pathname === "/api/v0.4/dispatch") {
		const parsed = dispatchSchema.safeParse(await readJson(req));
		if (!parsed.success) {
			return Response.json(
				{ error: "invalid_dispatch", issues: parsed.error.issues },
				{ status: 422 },
			);
		}
		const now = parsed.data.reference_date ?? new Date().toISOString();
		const result = await runtime.dispatch(now);
		return Response.json({
			mode: "demo",
			action: "dispatcher_tick",
			result,
			snapshot: await runtime.snapshot(new Date(now)),
		});
	}

	if (req.method === "POST" && url.pathname === "/api/v0.4/replies") {
		const parsed = replySchema.safeParse(await readJson(req));
		if (!parsed.success) {
			return Response.json(
				{ error: "invalid_reply", issues: parsed.error.issues },
				{ status: 422 },
			);
		}
		const timestamp = parsed.data.timestamp ?? new Date().toISOString();
		try {
			const decision = await runtime.engine.observeReply(
				parsed.data.opportunity_id,
				parsed.data.text,
				timestamp,
			);
			return Response.json({
				opportunity_id: parsed.data.opportunity_id,
				decision,
				snapshot: await runtime.snapshot(new Date(timestamp)),
			});
		} catch (error) {
			if (error instanceof Error && error.message === "opportunity_not_found") {
				return Response.json({ error: "opportunity_not_found" }, { status: 404 });
			}
			throw error;
		}
	}

	if (req.method === "POST" && url.pathname === "/api/v0.4/agent-step") {
		const parsed = agentStepSchema.safeParse(await readJson(req));
		if (!parsed.success) {
			return Response.json(
				{ error: "invalid_agent_step", issues: parsed.error.issues },
				{ status: 422 },
			);
		}
		const now = parsed.data.reference_date ?? new Date().toISOString();
		return Response.json({
			ok: true,
			step: parsed.data.step,
			mode: "demo",
			result: await runtime.runStep(parsed.data.step, now),
			snapshot: await runtime.snapshot(new Date(now)),
		});
	}

	return null;
}
