import { z } from "zod";

const allowedOrigins = z
	.string()
	.transform((value) =>
		value
			.split(",")
			.map((item) => item.trim().replace(/\/$/, ""))
			.filter(Boolean),
	)
	.pipe(
		z
			.array(z.string().min(1))
			.min(1)
			.refine((items) => items.every((item) => item !== "*"), {
				message: "copilot_allowed_origins_must_not_use_wildcard",
			}),
	);

export const copilotConfigSchema = z.object({
	COPILOT_ACCESS_TOKEN: z.string().min(32),
	COPILOT_ALLOWED_ORIGINS: allowedOrigins,
	COPILOT_HUBSPOT_PORTAL_ID: z.string().regex(/^\d+$/).optional(),
});

export type CopilotConfig = z.infer<typeof copilotConfigSchema>;

export function loadCopilotConfig(
	env: Record<string, string | undefined> = process.env,
): CopilotConfig {
	return copilotConfigSchema.parse(env);
}
