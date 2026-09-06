import { ThemeProvider } from "next-themes";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { McpProvider } from "./context.tsx";
import { AppRouter } from "./router.tsx";
import "./globals.css";

const rootElement = document.getElementById("root");

if (!rootElement) {
	throw new Error("Missing root element");
}

const root = createRoot(rootElement);
root.render(
	<StrictMode>
		<ThemeProvider attribute="class" defaultTheme="system" enableSystem>
			<McpProvider>
				<AppRouter />
			</McpProvider>
		</ThemeProvider>
	</StrictMode>,
);
