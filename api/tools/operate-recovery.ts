import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { buildDemoOperatorConsole } from "../autonomy/demo.ts";
import { operatorConsoleSnapshotSchema } from "../autonomy/types.ts";
import type { Env } from "../types/env.ts";
import { RECOVERY_RESOURCE_URI } from "./analyze-recovery.ts";

export const operateRecoveryInputSchema = z.object({
	reference_date: z.iso.datetime().optional(),
});

export type OperateRecoveryInput = z.infer<typeof operateRecoveryInputSchema>;
export type OperateRecoveryOutput = z.infer<
	typeof operatorConsoleSnapshotSchema
>;

export const operateRecoveryTool = (_env: Env) =>
	createTool({
		id: "operate_revenue_recovery",
		description:
			"Abre a Operator Console da Oplera V0.4 em Demo Mode, mostrando discovery, score, plano, policy gates, fila, conversas, handoffs e audit trail sem depender de CRM ou mensageria externos.",
		inputSchema: operateRecoveryInputSchema,
		outputSchema: operatorConsoleSnapshotSchema,
		_meta: { ui: { resourceUri: RECOVERY_RESOURCE_URI } },
		annotations: {
			readOnlyHint: true,
			destructiveHint: false,
			idempotentHint: true,
			openWorldHint: false,
		},
		execute: async ({ context }) => {
			const reference = context.reference_date
				? new Date(context.reference_date)
				: new Date();
			return buildDemoOperatorConsole(reference);
		},
	});
