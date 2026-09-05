import type { DefaultEnv } from "@decocms/runtime";
import { z } from "zod";

export const StateSchema = z.object({
	companyName: z.string().optional().describe("Nome da empresa atendida"),
	averageTicket: z
		.number()
		.nonnegative()
		.optional()
		.describe("Ticket médio em reais"),
});

export type Env = DefaultEnv<typeof StateSchema>;
