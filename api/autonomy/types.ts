import { z } from "zod";
import { conversationMessageSchema } from "../domain/recovery.ts";

export const recoveryStatusSchema = z.enum([
	"discovered",
	"eligible",
	"planned",
	"scheduled",
	"contacted",
	"awaiting_reply",
	"engaged",
	"human_review",
	"handed_off",
	"recovered",
	"lost",
	"suppressed",
]);

export const recoveryReasonCodeSchema = z.enum([
	"proposal_ghosted",
	"lost_timing",
	"seller_dropped",
	"budget_objection",
	"high_intent_abandoned",
	"stale_low_intent",
]);

export const recoveryChannelSchema = z.enum(["whatsapp", "email"]);
export const agentStatusSchema = z.enum(["running", "paused", "needs_attention"]);
export const conversationStateSchema = z.enum([
	"reactivation",
	"interest_check",
	"reason_discovery",
	"objection_handling",
	"qualification",
	"meeting_booking",
	"handoff",
	"closed",
]);

export const recoverySignalsSchema = z.object({
	previousEngagement: z.boolean(),
	proposalSent: z.boolean(),
	explicitBuyingQuestion: z.boolean(),
	knownObjection: z.boolean(),
	sellerDropped: z.boolean(),
	lostReason: z.enum(["timing", "budget", "other", "none"]),
});

export const recoveryCandidateSchema = z.object({
	id: z.string().min(1),
	crmId: z.string().min(1),
	contactName: z.string().min(1),
	company: z.string().min(1),
	dealName: z.string().min(1),
	pipelineStage: z.string().min(1),
	amount: z.number().nonnegative(),
	daysInactive: z.number().int().nonnegative(),
	lastActivity: z.iso.datetime(),
	originalReason: z.string(),
	recoveryScore: z.number().int().min(0).max(100),
	reasonCode: recoveryReasonCodeSchema,
	reasonSummary: z.string(),
	status: recoveryStatusSchema,
	nextAction: z.string(),
	dueAt: z.iso.datetime().optional(),
	attempt: z.number().int().nonnegative(),
	assignee: z.string(),
	channel: recoveryChannelSchema,
	evidence: z.array(z.string()).max(20),
	conversation: z.array(conversationMessageSchema).max(100),
	signals: recoverySignalsSchema,
	optedOut: z.boolean(),
	activeHumanConversation: z.boolean(),
});

export const recoveryPlanSchema = z.object({
	candidateId: z.string(),
	strategy: z.enum([
		"proposal_followup",
		"timing_reactivation",
		"seller_drop_repair",
		"budget_recheck",
		"intent_reactivation",
		"light_recheck",
	]),
	objective: z.string(),
	channel: recoveryChannelSchema,
	maxAttempts: z.number().int().min(1).max(10),
	firstAction: z.object({ type: z.enum(["send_message", "human_review"]) }),
	followUpAfterHours: z.number().int().positive(),
});

export const policyResultSchema = z.enum(["allowed", "blocked", "requires_approval"]);
export const messageModeSchema = z.enum(["free_form", "approved_template"]);

export const policyDecisionSchema = z.object({
	result: policyResultSchema,
	reasons: z.array(z.string()),
	serviceWindowOpen: z.boolean().nullable().optional(),
	serviceWindowExpiresAt: z.iso.datetime().optional(),
	nextEligibleAt: z.iso.datetime().optional(),
});

export const recoveryPolicySchema = z.object({
	contact: z.object({
		maxAttempts: z.number().int().min(1).max(20),
		minimumIntervalHours: z.number().nonnegative(),
		allowedHours: z.object({ start: z.number().int().min(0).max(23), end: z.number().int().min(1).max(24) }),
		allowedWeekdays: z.array(z.number().int().min(0).max(6)),
		timeZone: z.string(),
		suppressOnOptOut: z.boolean(),
		suppressIfActiveHumanConversation: z.boolean(),
	}),
	commercial: z.object({
		aiMayMentionPricing: z.boolean(),
		maxAutonomousDiscountPercent: z.number().min(0).max(100),
		allowedPaymentConditions: z.array(z.string()),
		customProposalRequiresHuman: z.boolean(),
	}),
	handoff: z.object({
		highIntentToHuman: z.boolean(),
		complaintToHuman: z.boolean(),
		legalOrContractToHuman: z.boolean(),
		unknownCustomizationToHuman: z.boolean(),
		lowEvidenceToHuman: z.boolean(),
	}),
});

export const taskStatusSchema = z.enum([
	"pending",
	"leased",
	"running",
	"succeeded",
	"failed",
	"cancelled",
]);

export const recoveryTaskSchema = z.object({
	id: z.string(),
	opportunityId: z.string(),
	recoverySessionId: z.string(),
	taskType: z.enum(["analyze", "plan", "send_message", "check_reply", "handoff", "crm_sync"]),
	payload: z.record(z.string(), z.unknown()),
	priority: z.number().int(),
	dueAt: z.iso.datetime(),
	leasedAt: z.iso.datetime().optional(),
	leasedBy: z.string().optional(),
	attempt: z.number().int().nonnegative(),
	maxAttempts: z.number().int().positive(),
	lastError: z.string().optional(),
	createdAt: z.iso.datetime(),
	completedAt: z.iso.datetime().optional(),
	status: taskStatusSchema,
	idempotencyKey: z.string().min(1),
});

export const recoveryMessageSchema = z.object({
	id: z.string(),
	opportunityId: z.string(),
	actor: z.enum(["customer", "oplera", "human"]),
	channel: recoveryChannelSchema,
	text: z.string(),
	timestamp: z.iso.datetime(),
});

export const recoveryHandoffSchema = z.object({
	id: z.string(),
	opportunityId: z.string(),
	reason: z.string(),
	summary: z.string(),
	context: z.array(z.string()),
	lastMessage: z.string(),
	recommendedAction: z.string(),
	createdAt: z.iso.datetime(),
});

export const recoveryEventSchema = z.object({
	id: z.string(),
	timestamp: z.iso.datetime(),
	opportunityId: z.string().optional(),
	taskId: z.string().optional(),
	actor: z.enum(["system", "agent", "policy", "provider", "human", "customer"]),
	action: z.string(),
	inputSummary: z.string(),
	decision: z.string(),
	policyResult: policyResultSchema.optional(),
	toolInvoked: z.string().optional(),
	result: z.string(),
	error: z.string().optional(),
});

export const operatorConsoleSnapshotSchema = z.object({
	version: z.literal("0.4"),
	companyName: z.string(),
	generatedAt: z.iso.datetime(),
	agentStatus: agentStatusSchema,
	queue: z.object({
		dueNow: z.number().int().nonnegative(),
		scheduled: z.number().int().nonnegative(),
		processing: z.number().int().nonnegative(),
		awaitingReply: z.number().int().nonnegative(),
		humanReview: z.number().int().nonnegative(),
	}),
	recovery: z.object({
		opportunitiesAnalyzed: z.number().int().nonnegative(),
		recoverable: z.number().int().nonnegative(),
		contacted: z.number().int().nonnegative(),
		engaged: z.number().int().nonnegative(),
		handedOff: z.number().int().nonnegative(),
		recoveredWon: z.number().int().nonnegative(),
		recoverableValue: z.number().nonnegative(),
		recoveredValue: z.number().nonnegative(),
	}),
	agentFocus: z.array(z.object({ id: z.string(), label: z.string(), dueAt: z.iso.datetime(), reason: z.string() })),
	opportunities: z.array(recoveryCandidateSchema),
	plans: z.array(recoveryPlanSchema),
	tasks: z.array(recoveryTaskSchema),
	messages: z.array(recoveryMessageSchema),
	handoffs: z.array(recoveryHandoffSchema),
	events: z.array(recoveryEventSchema),
	policy: recoveryPolicySchema,
});

export type RecoveryStatus = z.infer<typeof recoveryStatusSchema>;
export type RecoveryReasonCode = z.infer<typeof recoveryReasonCodeSchema>;
export type RecoveryChannel = z.infer<typeof recoveryChannelSchema>;
export type RecoverySignals = z.infer<typeof recoverySignalsSchema>;
export type RecoveryCandidate = z.infer<typeof recoveryCandidateSchema>;
export type RecoveryPlan = z.infer<typeof recoveryPlanSchema>;
export type RecoveryPolicy = z.infer<typeof recoveryPolicySchema>;
export type PolicyDecision = z.infer<typeof policyDecisionSchema>;
export type MessageMode = z.infer<typeof messageModeSchema>;
export type RecoveryTask = z.infer<typeof recoveryTaskSchema>;
export type RecoveryMessage = z.infer<typeof recoveryMessageSchema>;
export type RecoveryHandoff = z.infer<typeof recoveryHandoffSchema>;
export type RecoveryEvent = z.infer<typeof recoveryEventSchema>;
export type OperatorConsoleSnapshot = z.infer<typeof operatorConsoleSnapshotSchema>;
export type ConversationState = z.infer<typeof conversationStateSchema>;
