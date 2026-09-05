import { createPublicPrompt } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../types/env.ts";

export const auditRecoveryPrompt = (_env: Env) =>
	createPublicPrompt({
		name: "auditar_recuperacao_receita",
		title: "Auditar recuperação de receita",
		description:
			"Abre a demonstração da Oplera e prioriza oportunidades comerciais abandonadas.",
		argsSchema: {
			company_name: z.string().optional().describe("Nome da empresa"),
		},
		execute: async ({ args }) => ({
			messages: [
				{
					role: "user" as const,
					content: {
						type: "text" as const,
						text: `Use a ferramenta analyze_revenue_recovery para analisar ${args.company_name ?? "minha operação comercial"}. Se nenhuma conversa foi fornecida, execute a demonstração com dados fictícios e explique que os valores não representam resultados reais.`,
					},
				},
			],
		}),
	});
