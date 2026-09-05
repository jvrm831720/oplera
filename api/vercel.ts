import { app } from "./app.ts";

/**
 * Vercel adapter. The rewrite in vercel.json preserves the public pathname in
 * __path so the platform-agnostic app receives /demo, /health or /api/mcp.
 */
export default async function handler(request: Request): Promise<Response> {
	const url = new URL(request.url);
	const requestedPath = url.searchParams.get("__path");

	if (requestedPath !== null) {
		url.pathname = requestedPath.startsWith("/")
			? requestedPath
			: `/${requestedPath}`;
		url.searchParams.delete("__path");
	}

	return app.fetch(new Request(url, request));
}
