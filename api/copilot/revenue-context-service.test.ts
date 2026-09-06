import { describe, expect, test } from "bun:test";
import type { RecoveryCandidate } from "../autonomy/types.ts";
import type {
	HubSpotCopilotSearchInput,
	HubSpotSellerCopilotSource,
} from "../pilot/hubspot.ts";
import type {
	InternalRevenueContext,
	InternalRevenueContextReader,
} from "./internal-context.ts";
import {
	type RevenueContextHubSpotProvider,
	RevenueContextService,
} from "./revenue-context-service.ts";

function candidate(
	id = "100",
	name = "Mariana Costa",
	company = "Clínica Aurora",
): RecoveryCandidate {
	return {
		id,
		crmId: id,
		contactName: name,
		company,
		dealName: `Projeto ${company}`,
		pipelineStage: "proposal",
		amount: 18_500,
		daysInactive: 1,
		lastActivity: "2026-09-07T13:00:00.000Z",
		originalReason: "timing",
		recoveryScore: 87,
		reasonCode: "lost_timing",
		reasonSummary: "A oportunidade parou por timing e pode ser revisitada.",
		status: "engaged",
		nextAction: "Confirmar timing.",
		attempt: 1,
		assignee: "owner-1",
		channel: "whatsapp",
		evidence: ["Negócio aberto", "Resposta recebida"],
		conversation: [
			{
				direction: "inbound",
				text: "Quero retomar no mês que vem.",
				timestamp: "2026-09-07T14:00:00.000Z",
			},
		],
		signals: {
			previousEngagement: true,
			proposalSent: true,
			explicitBuyingQuestion: false,
			knownObjection: true,
			sellerDropped: false,
			lostReason: "timing",
		},
		optedOut: false,
		activeHumanConversation: false,
	};
}

function source(
	id = "100",
	name = "Mariana Costa",
	company = "Clínica Aurora",
): HubSpotSellerCopilotSource {
	const item = candidate(id, name, company);
	return {
		candidate: item,
		identity: {
			contactId: `contact-${id}`,
			name,
			phone: id === "100" ? "+5521999999999" : "+5521888888888",
			email: id === "100" ? "mariana@example.com" : "outro@example.com",
			role: "Diretora",
			companyId: `company-${id}`,
			company,
		},
		deal: {
			dealId: id,
			dealName: item.dealName,
			stage: "proposal",
			amount: item.amount,
			currency: "BRL",
			owner: "owner-1",
			lastActivityAt: "2026-09-07T14:00:00.000Z",
		},
		activities: [
			{
				id: `note-${id}`,
				type: "notes",
				timestamp: "2026-09-07T13:00:00.000Z",
				text: "Proposta enviada e timing registrado.",
			},
		],
		fetchedAt: "2026-09-07T15:00:00.000Z",
	};
}

class FakeHubSpot implements RevenueContextHubSpotProvider {
	async getSellerCopilotSource(id: string) {
		return id === "100" ? source() : null;
	}

	async searchSellerCopilotSources(input: HubSpotCopilotSearchInput) {
		if (
			input.phone === "+5521999999999" ||
			input.email === "mariana@example.com" ||
			input.name === "Mariana Costa"
		) {
			return [{ source: source(), score: 100 }];
		}
		if (input.name === "Contato Duplicado") {
			return [
				{
					source: source("100", "Contato Duplicado", "Clínica Aurora"),
					score: 90,
				},
				{
					source: source("101", "Contato Duplicado", "Aurora Labs"),
					score: 90,
				},
			];
		}
		return [];
	}
}

const internalContext: InternalRevenueContext = {
	session: {
		id: "session-100",
		status: "engaged",
		strategy: "timing_reactivation",
		attempt: 1,
		maxAttempts: 3,
		startedAt: "2026-09-07T12:00:00.000Z",
		completedAt: null,
	},
	nextTask: null,
	messages: [
		{
			id: "message-100",
			direction: "inbound",
			actor: "customer",
			channel: "whatsapp",
			content: "Quero retomar no mês que vem.",
			timestamp: "2026-09-07T14:00:00.000Z",
			externalMessageId: "wamid.inbound.100",
		},
	],
	latestDecision: {
		decisionType: "conversation",
		decision: "objection:reason_discovery",
		evidence: { objection: "timing", should_handoff: false },
		shortReason: "Confirmar a janela de decisão.",
		createdAt: "2026-09-07T14:01:00.000Z",
	},
	events: [
		{
			id: "event-100",
			actor: "agent",
			action: "reply_observed",
			decision: "objection:timing",
			policyResult: "allowed",
			result: "Objeção de timing registrada.",
			createdAt: "2026-09-07T14:01:00.000Z",
		},
	],
	handoff: null,
	pilotApproval: null,
	pilotOutbound: [
		{
			providerMessageId: "wamid.outbound.100",
			status: "sent",
			createdAt: "2026-09-06T12:00:00.000Z",
		},
	],
	pilotInbound: [
		{
			externalMessageId: "wamid.inbound.100",
			processedAt: "2026-09-07T14:00:05.000Z",
		},
	],
	freshnessAt: "2026-09-07T14:01:00.000Z",
};

class FakeInternalReader implements InternalRevenueContextReader {
	async read(externalOpportunityId: string) {
		if (externalOpportunityId !== "100")
			throw new Error("unexpected_opportunity");
		return internalContext;
	}
}

describe("RevenueContextService", () => {
	test("combina HubSpot, WhatsApp e estado Oplera no SellerCopilotContext", async () => {
		const service = new RevenueContextService(
			new FakeHubSpot(),
			new FakeInternalReader(),
			undefined,
			() => new Date("2026-09-07T15:00:00.000Z"),
		);
		const context = await service.getContext("100");
		expect(context.identity.name).toBe("Mariana Costa");
		expect(context.identity.company).toBe("Clínica Aurora");
		expect(context.deal.amount).toBe(18_500);
		expect(context.recovery.score).toBe(87);
		expect(context.recovery.strategy).toBe("timing_reactivation");
		expect(context.conversation.objection).toBe("timing");
		expect(context.conversation.serviceWindowStatus).toBe("open");
		expect(context.nextBestAction.type).toBe("timing_confirm");
		expect(context.timeline.some((item) => item.source === "hubspot")).toBe(
			true,
		);
		expect(context.timeline.some((item) => item.source === "oplera")).toBe(
			true,
		);
		expect(context.timeline.some((item) => item.source === "whatsapp")).toBe(
			true,
		);
		expect(context.freshness.oplera).toBe("2026-09-07T14:01:00.000Z");
		expect(context.links.hubspot).toBeNull();
	});

	test("resolve telefone único", async () => {
		const service = new RevenueContextService(
			new FakeHubSpot(),
			new FakeInternalReader(),
		);
		const result = await service.resolve({ phone: "+5521999999999" });
		expect(result.status).toBe("resolved");
		if (result.status === "resolved")
			expect(result.match.opportunityId).toBe("100");
	});

	test("resolve e-mail único", async () => {
		const service = new RevenueContextService(
			new FakeHubSpot(),
			new FakeInternalReader(),
		);
		expect(
			(await service.resolve({ email: "mariana@example.com" })).status,
		).toBe("resolved");
	});

	test("resolve nome único", async () => {
		const service = new RevenueContextService(
			new FakeHubSpot(),
			new FakeInternalReader(),
		);
		expect((await service.resolve({ name: "Mariana Costa" })).status).toBe(
			"resolved",
		);
	});

	test("retorna ambiguous para nome duplicado", async () => {
		const service = new RevenueContextService(
			new FakeHubSpot(),
			new FakeInternalReader(),
		);
		const result = await service.resolve({ name: "Contato Duplicado" });
		expect(result.status).toBe("ambiguous");
		expect(result.matches).toHaveLength(2);
	});

	test("retorna not_found quando não existe correspondência", async () => {
		const service = new RevenueContextService(
			new FakeHubSpot(),
			new FakeInternalReader(),
		);
		const result = await service.resolve({ email: "ausente@example.com" });
		expect(result).toEqual({ status: "not_found", matches: [] });
	});

	test("não inventa contexto para oportunidade inexistente", async () => {
		const service = new RevenueContextService(
			new FakeHubSpot(),
			new FakeInternalReader(),
		);
		await expect(service.getContext("999")).rejects.toThrow(
			"copilot_context_not_found",
		);
	});
});
