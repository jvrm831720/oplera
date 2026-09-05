export type PilotLogLevel = "info" | "warn" | "error";

export function pilotLog(
	level: PilotLogLevel,
	event: string,
	data: Record<string, unknown> = {},
): void {
	const payload = JSON.stringify({
		timestamp: new Date().toISOString(),
		component: "oplera-live-pilot",
		level,
		event,
		...data,
	});
	if (level === "error") console.error(payload);
	else if (level === "warn") console.warn(payload);
	else console.log(payload);
}
