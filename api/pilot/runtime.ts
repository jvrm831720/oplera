import { createHash } from "node:crypto";
import { resolveServiceWindow } from "../domain/recovery.ts";
import { AutonomousRecoveryEngine, draftRecoveryMessage } from "../autonomy/engine.ts";
import { planRecovery } from "../autonomy/planner.ts";
import { defaultRecoveryPolicy, evaluateRecoveryPolicy } from "../autonomy/policy-engine.ts";
import { MemoryTaskQueue } from "../autonomy/task-queue.ts";
import type { MessageMode, PolicyDecision, RecoveryCandidate } from "../autonomy/types.ts";
import { loadPilotConfig, type PilotConfig } from "./config.ts";
import { HubSpotCRMProvider } from "./hubspot.ts";
import { pilotLog } from "./logger.ts";
import { PilotStateStore } from "./state-store.ts";
import { type WhatsAppInboundMessage, WhatsAppCloudProvider } from "./whatsapp.ts";

export interface PilotPreview {
	candidate: RecoveryCandidate;
	plan: ReturnType<typeof planRecovery>;
	messageMode: MessageMode;
	message: string;
	policy: PolicyDecision;
	fingerprint: string;
	approval: { approvedBy: string; approvedAt: string } | null;
	requiresHumanApproval: boolean;
}

function lastOutboundAt(candidate: RecoveryCandidate): string | undefined {
	return [...candidate.conversation].reverse().find((item) => item.direction === "outbound")?.timestamp;
}

function fingerprintFor(input: {
	candidate: RecoveryCandidate;
	mode: MessageMode;
	message: string;
	strategy: string;
	templateName: string;
}): string {
	return createHash("sha256")
		.update(
			JSON.stringify({
				opportunityId: input.candidate.id,
				attempt: input.candidate.attempt,
				mode: input.mode,
				message: input.message,
				strategy: input.strategy,
				templateName: input.templateName,
			}),
		)
		.digest("hex");
}

export class PilotRuntime {
	readonly engine: AutonomousRecoveryEngine;

	constructor(
		readonly config: PilotConfig,
		readonly state: PilotStateStore,
		readonly hubspot: HubSpotCRMProvider,
		readonly whatsapp: WhatsAppCloudProvider,
	) {
		this.engine = new AutonomousRecoveryEngine(
			hubspot,
			whatsapp,
			new MemoryTaskQueue(),
			defaultRecoveryPolicy,
		);
	}

	async listOpportunities(): Promise<RecoveryCandidate[]> {
		return this.hubspot.listRecoveryCandidates();
	}

	async preview(opportunityId: string, now = new Date().toISOString()): Promise<PilotPreview> {
		const candidate = await this.hubspot.getOpportunityContext(opportunityId);
		if (!candidate) throw new Error("opportunity_not_found");
		const plan = planRecovery(candidate, defaultRecoveryPolicy.contact.maxAttempts);
		const serviceWindow = resolveServiceWindow(candidate.conversation, new Date(now));
		const messageMode: MessageMode = serviceWindow.serviceWindowOpen === true ? "free_form" : "approved_template";
		const message = draftRecoveryMessage(candidate);
		const policy = evaluateRecoveryPolicy({
			policy: defaultRecoveryPolicy,
			action: "send_message",
			channel: "whatsapp",
			now,
			conversation: candidate.conversation,
			attempt: candidate.attempt,
			lastContactAt: lastOutboundAt(candidate),
			optedOut: candidate.optedOut,
			activeHumanConversation: candidate.activeHumanConversation,
			opportunityStatus: candidate.status,
			suppressed: candidate.status === "suppressed",
			messageMode,
			providerSupportsApprovedTemplate: true,
		});
		const fingerprint = fingerprintFor({
			candidate,
			mode: messageMode,
			message,
			strategy: plan.strategy,
			templateName: this.config.WHATSAPP_TEMPLATE_NAME,
		});
		const approval = this.state.getApproval(candidate.id, fingerprint);
		return {
			candidate,
			plan,
			messageMode,
			message,
			policy,
			fingerprint,
			approval: approval
				? { approvedBy: approval.approved_by, approvedAt: approval.approved_at }
				: null,
			requiresHumanApproval: candidate.attempt === 0 && !approval,
		};
	}

	async approve(
		opportunityId: string,
		approvedBy: string,
		now = new Date().toISOString(),
	): Promise<PilotPreview> {
		const preview = await this.preview(opportunityId, now);
		this.state.approve(opportunityId, preview.fingerprint, approvedBy, now);
		pilotLog("info", "pilot_first_contact_approved", {
			opportunity_id: opportunityId,
			approved_by: approvedBy,
			fingerprint: preview.fingerprint,
		});
		return this.preview(opportunityId, now);
	}

	async execute(opportunityId: string, now = new Date().toISOString()) {
		const preview = await this.preview(opportunityId, now);
		if (preview.policy.result !== "allowed") {
			return { status: "policy_blocked" as const, policy: preview.policy, preview };
		}
		if (preview.requiresHumanApproval) throw new Error("pilot_first_contact_approval_required");

		const idempotencyKey = `pilot:${preview.candidate.id}:${preview.plan.strategy}:${preview.candidate.attempt + 1}:${preview.messageMode}`;
		const result =
			preview.messageMode === "approved_template"
				? await this.whatsapp.sendApprovedTemplate({
						idempotencyKey,
						opportunityId,
						contactName: preview.candidate.contactName,
					})
				: await this.whatsapp.sendMessage({
						idempotencyKey,
						opportunityId,
						channel: "whatsapp",
						text: preview.message,
						mode: "free_form",
					});

		if (this.config.PILOT_DRY_RUN) {
			return {
				status: "dry_run" as const,
				idempotencyKey,
				provider: result,
				preview,
				writeback: false,
			};
		}

		if (!this.state.isWritebackComplete(idempotencyKey)) {
			const outboundText =
				preview.messageMode === "approved_template"
					? `[template:${this.config.WHATSAPP_TEMPLATE_NAME}]`
					: preview.message;
			await this.hubspot.appendConversationMessage(opportunityId, {
				direction: "outbound",
				text: outboundText,
				timestamp: now,
			});
			await this.hubspot.recordContactAttempt(opportunityId);
			await this.hubspot.createActivity(
				opportunityId,
				`WhatsApp recovery outreach accepted: ${result.providerMessageId}`,
			);
			await this.hubspot.updateOpportunity(opportunityId, "awaiting_reply");
			this.state.markWritebackComplete(idempotencyKey, now);
			if (preview.candidate.attempt === 0) this.state.consumeApproval(opportunityId, now);
		}

		return {
			status: "sent" as const,
			idempotencyKey,
			provider: result,
			preview,
			writeback: true,
		};
	}

	async handleIncoming(message: WhatsAppInboundMessage) {
		if (!this.state.markInboundSeen(message.id, message.timestamp)) {
			return { status: "duplicate" as const, messageId: message.id };
		}
		const opportunityId = await this.hubspot.findAllowedOpportunityByPhone(message.from);
		if (!opportunityId) {
			pilotLog("warn", "whatsapp_inbound_not_allowlisted", {
				message_id: message.id,
				from: message.from,
			});
			return { status: "ignored" as const, messageId: message.id };
		}
		const decision = await this.engine.observeReply(
			opportunityId,
			message.text,
			message.timestamp,
		);
		await this.hubspot.createActivity(
			opportunityId,
			`WhatsApp inbound ${message.id} classified as ${decision.intent}.`,
		);
		return { status: "processed" as const, messageId: message.id, opportunityId, decision };
	}
}

let singleton: PilotRuntime | null = null;

export function getPilotRuntime(): PilotRuntime {
	if (singleton) return singleton;
	const config = loadPilotConfig();
	const state = new PilotStateStore(config.PILOT_STATE_DB_PATH);
	const hubspot = new HubSpotCRMProvider(config);
	const whatsapp = new WhatsAppCloudProvider(
		config,
		state,
		(id) => hubspot.resolveMessagingRecipient(id),
	);
	singleton = new PilotRuntime(config, state, hubspot, whatsapp);
	return singleton;
}
