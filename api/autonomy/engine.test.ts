import { describe, expect, test } from "bun:test";
import { demoCandidates } from "./demo.ts";
import { AutonomousRecoveryEngine } from "./engine.ts";
import { defaultRecoveryPolicy } from "./policy-engine.ts";
import { DemoCRMProvider, DemoMessagingProvider } from "./providers.ts";
import { MemoryTaskQueue } from "./task-queue.ts";

describe("autonomous recovery lifecycle", () => {
	test("policy-gates execution and records an auditable send", async () => {
		const reference = new Date("2026-09-07T15:00:00.000Z");
		const candidates = demoCandidates(reference);
		const candidate = candidates.find(
			(item) => item.id === "opp-proposal-ghosted",
		);
		if (!candidate) throw new Error("proposal demo candidate missing");
		candidate.dueAt = reference.toISOString();
		const crm = new DemoCRMProvider([candidate]);
		const queue = new MemoryTaskQueue();
		const engine = new AutonomousRecoveryEngine(
			crm,
			new DemoMessagingProvider(),
			queue,
			defaultRecoveryPolicy,
		);

		await engine.discover();
		const scheduled = await engine.schedule(
			candidate.id,
			reference.toISOString(),
		);
		expect(scheduled?.status).toBe("pending");
		const result = await engine.dispatchDue(
			"worker-a",
			reference.toISOString(),
		);
		expect(result.executed).toBe(1);
		expect(result.blocked).toBe(0);
		expect(queue.list()[0]?.status).toBe("succeeded");
		expect(engine.events.some((item) => item.action === "policy_checked")).toBe(
			true,
		);
		expect(
			engine.events.some((item) => item.action === "recovery_message_sent"),
		).toBe(true);
		const updated = await crm.getOpportunityContext(candidate.id);
		expect(updated?.status).toBe("awaiting_reply");
	});

	test("creates a factual handoff without chain-of-thought", async () => {
		const reference = new Date("2026-09-07T15:00:00.000Z");
		const candidate = demoCandidates(reference)[0];
		if (!candidate) throw new Error("demo candidate missing");
		const crm = new DemoCRMProvider([candidate]);
		const engine = new AutonomousRecoveryEngine(
			crm,
			new DemoMessagingProvider(),
			new MemoryTaskQueue(),
			defaultRecoveryPolicy,
		);
		await engine.observeReply(
			candidate.id,
			"Quero fechar, mas preciso falar com alguém sobre o contrato.",
			reference.toISOString(),
		);
		expect(engine.handoffs).toHaveLength(1);
		const handoff = engine.handoffs[0];
		expect(handoff?.reason).toBe("legal_or_contract");
		expect(JSON.stringify(handoff)).not.toContain("chain-of-thought");
		expect(JSON.stringify(handoff)).not.toContain("reasoning");
	});

	test("demo contains the required recovery states", () => {
		const statuses = new Set(demoCandidates().map((item) => item.status));
		expect(statuses.has("suppressed")).toBe(true);
		expect(statuses.has("recovered")).toBe(true);
		expect(statuses.has("human_review")).toBe(true);
		expect(demoCandidates()).toHaveLength(8);
	});
});
