import { describe, expect, test } from "bun:test";
import type { RecoveryCandidate } from "../autonomy/types.ts";
import type {
	HubSpotCopilotSearchInput,
	HubSpotSellerCopilotSource,
} from "../pilot/hubspot.ts";
import type { CopilotConfig } from "./config.ts";
import { NullInternalRevenueContextReader } from "./internal-context.ts";
import {
	type RevenueContextHubSpotProvider,
	RevenueContextService,
} from "./revenue-context-service.ts";

function source(): HubSpotSellerCopilotSource {
	const candidate: RecoveryCandidate = {
		id: "100",
		crmId: "100",
		contactName: "Mariana Costa",
		company: "Clínica Aurora",
		dealName: "Projeto Aurora",
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
			knownObjection: false,
			sellerDropped: false,
			lostReason: "timing",
		},
		optedOut: false,
		activeHumanConversation: false,
	};
	return {
		candidate,
		identity: {
			contactId: "200",
			name: "Mariana Costa",
			phone: "+5521999999999",
			email: "mariana@example.com",
			role: "Diretora",
			companyId: "300",
			company: "Clínica Aurora",
		},
		deal: {
			dealId: "100",
			dealName: "Projeto Aurora",
			stage: "proposal",
			amount: 18_500,
			currency: "BRL",
			owner: "owner-1",
			lastActivityAt: "2026-09-07T14:00:00.000Z",
		},
		activities: [
			{
				id: "note-1",
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
	async searchSellerCopilotSources(_input: HubSpotCopilotSearchInput) {
		return [{ source: source(), score: 100 }];
	}
}

const config: CopilotConfig = {
	COPILOT_ACCESS_TOKEN: "12345678901234567890123456789012",
	COPILOT_ALLOWED_ORIGINS: ["chrome-extension://abcdefghijklmnop"],
	COPILOT_HUBSPOT_PORTAL_ID: "12345",
};

describe("RevenueContextService", () => {
	test("resolve contato allowlisted e retorna contexto comercial estruturado", async () => {
		const service = new RevenueContextService(
			new FakeHubSpot(),
			new NullInternalRevenueContextReader(),
			config,
			undefined,
			() => new Date("2026-09-07T15:00:00.000Z"),
		);
		const resolution = await service.resolve({ phone: "+5521999999999" });
		expect(resolution.status).toBe("resolved");
		const context = await service.getContext("100");
		expect(context.identity.name).toBe("Mariana Costa");
		expect(context.deal.amount).toBe(18_500);
		expect(context.recovery.score).toBe(87);
		expect(context.conversation.objection).toBe("timing");
		expect(context.conversation.serviceWindowStatus).toBe("open");
		expect(context.nextBestAction.type).toBe("timing_confirm");
		expect(context.links.hubspot).toContain("/12345/deal/100");
	});

	test("não inventa contexto para oportunidade inexistente", async () => {
		const service = new RevenueContextService(
			new FakeHubSpot(),
			new NullInternalRevenueContextReader(),
			config,
		);
		await expect(service.getContext("999")).rejects.toThrow(
			"copilot_context_not_found",
		);
	});
});
