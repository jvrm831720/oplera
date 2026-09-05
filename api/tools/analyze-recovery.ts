import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import {
	analyzeRecoveryPipeline,
	conversationSchema,
	recoveryAnalysisSchema,
	sampleConversations,
} from "../domain/recovery.ts";
import type { Env } from "../types/env.ts";

export const RECOVERY_RESOURCE_URI = "ui://oplera/revenue-recovery";

export const analyzeRecoveryInputSchema = z.object({
	company_name: z
		.string()
		.trim()
		.min(1)
		.max(160)
		.optional()
		.describe("Nome da empresa analisada"),
	average_ticket: z
		.number()
		.nonnegative()
		.max(100_000_000)
		.optional()
		.describe(
			"Ticket médio em reais usado quando a oportunidade não tem valor",
		),
	reference_date: z.iso
		.datetime()
		.optional()
		.describe("Data de referência ISO. O padrão é agora."),
	conversations: z
		.array(conversationSchema)
		.max(500)
		.optional()
		.describe(
			"Conversas comerciais. Se omitido, executa uma demonstração segura com dados fictícios.",
		),
});

export type AnalyzeRecoveryInput = z.infer<typeof analyzeRecoveryInputSchema>;
export type AnalyzeRecoveryOutput = z.infer<typeof recoveryAnalysisSchema>;

export const analyzeRecoveryTool = (_env: Env) =>
	createTool({
		id: "analyze_revenue_recovery",
		description:
			"Analisa conversas comerciais, exclui perdas e vendas já concluídas, prioriza oportunidades abandonadas e abre o painel Oplera Revenue com o potencial recuperável. Use sem conversations para demonstrar com dados fictícios.",
		inputSchema: analyzeRecoveryInputSchema,
		outputSchema: recoveryAnalysisSchema,
		_meta: { ui: { resourceUri: RECOVERY_RESOURCE_URI } },
		annotations: {
			readOnlyHint: true,
			destructiveHint: false,
			idempotentHint: true,
			openWorldHint: false,
		},
		execute: async ({ context }) => {
			const referenceDate = context.reference_date
				? new Date(context.reference_date)
				: new Date();
			const isSample = context.conversations === undefined;
			const analysis = analyzeRecoveryPipeline({
				companyName: context.company_name,
				averageTicket: context.average_ticket,
				referenceDate: referenceDate.toISOString(),
				conversations:
					context.conversations ?? sampleConversations(referenceDate),
				isSample,
			});

			return analysis;
		},
	});
