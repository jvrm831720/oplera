import { z } from "zod";
import { decideConversationReply } from "./conversation-agent.ts";
import { buildDemoOperatorConsole } from "./demo.ts";
import { defaultRecoveryPolicy } from "./policy-engine.ts";

const replySchema = z.object({
	opportunity_id: z.string().min(1),
	text: z.string().trim().min(1).max(4_000),
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
});

export async function handleAutonomyHttp(req: Request): Promise<Response | null> {
	const url = new URL(req.url);
	if (req.method === "GET" && url.pathname === "/api/v0.4/operator-console") {
		return Response.json(buildDemoOperatorConsole());
	}

	if (req.method === "POST" && url.pathname === "/api/v0.4/dispatch") {
		const snapshot = buildDemoOperatorConsole();
		return Response.json({
			mode: "demo",
			queue_due_now: snapshot.queue.dueNow,
			action: "dispatcher_tick",
			message: "Demo dispatcher evaluated due work server-side. Provider side effects remain demo-only.",
			snapshot,
		});
	}

	if (req.method === "POST" && url.pathname === "/api/v0.4/replies") {
		const parsed = replySchema.safeParse(await req.json());
		if (!parsed.success) {
			return Response.json({ error: "invalid_reply", issues: parsed.error.issues }, { status: 422 });
		}
		const snapshot = buildDemoOperatorConsole();
		const candidate = snapshot.opportunities.find((item) => item.id === parsed.data.opportunity_id);
		if (!candidate) return Response.json({ error: "opportunity_not_found" }, { status: 404 });
		return Response.json({
			opportunity_id: candidate.id,
			decision: decideConversationReply(candidate, parsed.data.text, defaultRecoveryPolicy),
		});
	}

	if (req.method === "POST" && url.pathname === "/api/v0.4/agent-step") {
		const parsed = agentStepSchema.safeParse(await req.json());
		if (!parsed.success) {
			return Response.json({ error: "invalid_agent_step", issues: parsed.error.issues }, { status: 422 });
		}
		return Response.json({
			ok: true,
			step: parsed.data.step,
			mode: "demo",
			message: "n8n orchestration delegates business decisions to versioned Oplera code.",
			snapshot: buildDemoOperatorConsole(),
		});
	}

	return null;
}
