import { expect, test } from "bun:test";
import { PostgresRecoveryPersistence } from "../../api/autonomy/postgres-persistence.ts";
import { PostgresTaskQueue } from "../../api/autonomy/postgres-task-queue.ts";
import {
	createDatabaseClient,
	requireDatabaseUrl,
} from "../../api/db/client.ts";
import { HubSpotCRMProvider } from "../../api/pilot/hubspot.ts";
import { PostgresPilotStateStore } from "../../api/pilot/postgres-state-store.ts";
import { PilotRuntime } from "../../api/pilot/runtime.ts";
import {
	hubSpotFixtureFetch,
	jsonResponse,
	pilotTestConfig,
} from "../../api/pilot/test-fixtures.ts";
import { WhatsAppCloudProvider } from "../../api/pilot/whatsapp.ts";

const postgresTest = process.env.DATABASE_URL ? test : test.skip;

postgresTest("postgres pilot state persists approval and outbound operation across restart", async () => {
	const url = requireDatabaseUrl();
	const opportunityId = `restart-${crypto.randomUUID()}`;
	const fingerprint = crypto.randomUUID().replaceAll("-", "");
	const idempotencyKey = `outbound-${crypto.randomUUID()}`;
	const sqlA = createDatabaseClient(url);
	const storeA = new PostgresPilotStateStore(sqlA);

	await storeA.approve(
		opportunityId,
		0,
		fingerprint,
		"pilot-operator@example.com",
		"2026-09-06T12:00:00.000Z",
	);
	const reservation = await storeA.reserveOutbound(
		idempotencyKey,
		opportunityId,
		"whatsapp_cloud_api",
		{ message_type: "template" },
		"2026-09-06T12:01:00.000Z",
	);
	expect(reservation.acquired).toBe(true);
	await storeA.putOutbound(
		idempotencyKey,
		{ providerMessageId: "wamid.persisted", accepted: true },
		"2026-09-06T12:01:01.000Z",
	);
	await sqlA.close();

	const sqlB = createDatabaseClient(url);
	try {
		const storeB = new PostgresPilotStateStore(sqlB);
		const approval = await storeB.getApproval(opportunityId, fingerprint);
		expect(approval?.attempt).toBe(0);
		expect(
			await storeB.getApproval(opportunityId, `${fingerprint}-changed`),
		).toBeNull();
		expect(await storeB.getOutbound(idempotencyKey)).toEqual({
			providerMessageId: "wamid.persisted",
			accepted: true,
		});
		expect(await storeB.isWritebackComplete(idempotencyKey)).toBe(false);
		await storeB.markWritebackComplete(
			idempotencyKey,
			"2026-09-06T12:02:00.000Z",
		);
		expect(await storeB.isWritebackComplete(idempotencyKey)).toBe(true);
	} finally {
		await sqlB.close();
	}
});

postgresTest("postgres inbound deduplication admits exactly one concurrent claim", async () => {
	const url = requireDatabaseUrl();
	const sqlA = createDatabaseClient(url);
	const sqlB = createDatabaseClient(url);
	try {
		const storeA = new PostgresPilotStateStore(sqlA);
		const storeB = new PostgresPilotStateStore(sqlB);
		const messageId = `wamid.concurrent.${crypto.randomUUID()}`;
		const results = await Promise.all([
			storeA.markInboundSeen(
				"whatsapp_cloud_api",
				messageId,
				"2026-09-06T12:00:00.000Z",
			),
			storeB.markInboundSeen(
				"whatsapp_cloud_api",
				messageId,
				"2026-09-06T12:00:00.000Z",
			),
		]);
		expect(results.filter(Boolean)).toHaveLength(1);
	} finally {
		await Promise.all([sqlA.close(), sqlB.close()]);
	}
});

postgresTest("accepted WhatsApp operation survives crash and retry only completes HubSpot writeback", async () => {
	const url = requireDatabaseUrl();
	const config = pilotTestConfig({
		PILOT_DRY_RUN: "false",
		PILOT_KILL_SWITCH: "false",
	});
	const hubspotCalls: string[] = [];
	const fetchHubspot = hubSpotFixtureFetch(hubspotCalls);
	let whatsappNetworkCalls = 0;
	const fetchWhatsApp = Object.assign(
		async () => {
			whatsappNetworkCalls += 1;
			return jsonResponse({ messages: [{ id: "wamid.crash-recovery" }] });
		},
		{ preconnect: fetch.preconnect },
	);
	const now = "2026-09-07T15:00:00.000Z";

	const sqlA = createDatabaseClient(url);
	const stateA = new PostgresPilotStateStore(sqlA);
	const hubspotA = new HubSpotCRMProvider(
		config,
		fetchHubspot,
		() => new Date(now),
	);
	const whatsappA = new WhatsAppCloudProvider(
		config,
		stateA,
		(id) => hubspotA.resolveMessagingRecipient(id),
		fetchWhatsApp,
	);
	const runtimeA = new PilotRuntime(
		config,
		stateA,
		hubspotA,
		whatsappA,
		new PostgresTaskQueue(sqlA),
		new PostgresRecoveryPersistence(sqlA),
	);
	const approved = await runtimeA.approve(
		"100",
		"pilot-operator@example.com",
		now,
	);
	const idempotencyKey = `pilot:100:${approved.plan.strategy}:${approved.candidate.attempt + 1}:${approved.messageMode}`;
	await whatsappA.sendApprovedTemplate({
		idempotencyKey,
		opportunityId: "100",
		contactName: approved.candidate.contactName,
	});
	expect(whatsappNetworkCalls).toBe(1);
	expect(await stateA.isWritebackComplete(idempotencyKey)).toBe(false);
	await sqlA.close();

	const sqlB = createDatabaseClient(url);
	try {
		const stateB = new PostgresPilotStateStore(sqlB);
		const hubspotB = new HubSpotCRMProvider(
			config,
			fetchHubspot,
			() => new Date(now),
		);
		const whatsappB = new WhatsAppCloudProvider(
			config,
			stateB,
			(id) => hubspotB.resolveMessagingRecipient(id),
			fetchWhatsApp,
		);
		const runtimeB = new PilotRuntime(
			config,
			stateB,
			hubspotB,
			whatsappB,
			new PostgresTaskQueue(sqlB),
			new PostgresRecoveryPersistence(sqlB),
		);
		const result = await runtimeB.execute("100", now);
		expect(result.status).toBe("sent");
		expect(whatsappNetworkCalls).toBe(1);
		expect(await stateB.isWritebackComplete(idempotencyKey)).toBe(true);
		expect(hubspotCalls.some((item) => item.startsWith("PATCH "))).toBe(true);
		expect(hubspotCalls.some((item) => item.startsWith("POST "))).toBe(true);
	} finally {
		await sqlB.close();
	}
});

postgresTest("duplicate inbound webhook executes conversation processing exactly once", async () => {
	const sql = createDatabaseClient(requireDatabaseUrl());
	try {
		const config = pilotTestConfig();
		const hubspotCalls: string[] = [];
		const hubspot = new HubSpotCRMProvider(
			config,
			hubSpotFixtureFetch(hubspotCalls),
			() => new Date("2026-09-07T15:00:00.000Z"),
		);
		const state = new PostgresPilotStateStore(sql);
		const whatsapp = new WhatsAppCloudProvider(config, state, (id) =>
			hubspot.resolveMessagingRecipient(id),
		);
		const runtime = new PilotRuntime(
			config,
			state,
			hubspot,
			whatsapp,
			new PostgresTaskQueue(sql),
			new PostgresRecoveryPersistence(sql),
		);
		const inbound = {
			id: `wamid.inbound.${crypto.randomUUID()}`,
			from: "+5511999999999",
			timestamp: "2026-09-07T15:05:00.000Z",
			text: "O orçamento ainda é o principal ponto.",
		};
		const first = await runtime.handleIncoming(inbound);
		expect(first.status).toBe("processed");
		const callsAfterFirst = hubspotCalls.length;
		const second = await runtime.handleIncoming(inbound);
		expect(second.status).toBe("duplicate");
		expect(hubspotCalls.length).toBe(callsAfterFirst);
	} finally {
		await sql.close();
	}
});
