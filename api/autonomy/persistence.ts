import type {
	RecoveryCandidate,
	RecoveryChannel,
	RecoveryEvent,
	RecoveryHandoff,
	RecoveryMessage,
} from "./types.ts";

export type MaybePromise<T> = T | Promise<T>;

export interface RecoverySessionRecord {
	id: string;
	opportunityId: string;
	status: string;
	strategy: string;
	channel: RecoveryChannel;
	attempt: number;
	maxAttempts: number;
	startedAt: string;
	completedAt?: string;
}

export interface RecoveryDecisionRecord {
	opportunityId: string;
	recoverySessionId?: string;
	decisionType: string;
	decision: string;
	evidence: unknown;
	shortReason: string;
	model?: string;
	provider?: string;
	createdAt: string;
}

export interface RecoveryPersistence {
	upsertOpportunity(candidate: RecoveryCandidate): MaybePromise<void>;
	upsertSession(session: RecoverySessionRecord): MaybePromise<void>;
	appendMessage(
		message: RecoveryMessage,
		recoverySessionId?: string,
		externalMessageId?: string,
	): MaybePromise<void>;
	appendDecision(decision: RecoveryDecisionRecord): MaybePromise<void>;
	appendEvent(event: RecoveryEvent): MaybePromise<void>;
	appendHandoff(
		handoff: RecoveryHandoff,
		recoverySessionId?: string,
	): MaybePromise<void>;
}

export class NullRecoveryPersistence implements RecoveryPersistence {
	upsertOpportunity(_candidate: RecoveryCandidate): void {}
	upsertSession(_session: RecoverySessionRecord): void {}
	appendMessage(
		_message: RecoveryMessage,
		_recoverySessionId?: string,
		_externalMessageId?: string,
	): void {}
	appendDecision(_decision: RecoveryDecisionRecord): void {}
	appendEvent(_event: RecoveryEvent): void {}
	appendHandoff(_handoff: RecoveryHandoff, _recoverySessionId?: string): void {}
}
