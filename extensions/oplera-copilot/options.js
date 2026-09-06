function originPattern(url) {
	const parsed = new URL(url);
	return `${parsed.protocol}//${parsed.host}/*`;
}

async function load() {
	const stored = await chrome.storage.local.get(["apiBaseUrl", "accessToken"]);
	document.getElementById("api-base-url").value = stored.apiBaseUrl || "";
	document.getElementById("access-token").value = stored.accessToken || "";
}

function setStatus(message) {
	document.getElementById("status").textContent = message;
}

document.getElementById("settings-form").addEventListener("submit", async (event) => {
	event.preventDefault();
	const apiBaseUrl = document
		.getElementById("api-base-url")
		.value.trim()
		.replace(/\/$/, "");
	const accessToken = document.getElementById("access-token").value.trim();
	try {
		const parsed = new URL(apiBaseUrl);
		if (!/^https?:$/.test(parsed.protocol)) throw new Error("invalid_protocol");
		const pattern = originPattern(apiBaseUrl);
		const granted = await chrome.permissions.request({ origins: [pattern] });
		if (!granted) {
			setStatus("A permissão para acessar a API Oplera não foi concedida.");
			return;
		}
		await chrome.storage.local.set({ apiBaseUrl, accessToken });
		setStatus("Configurações salvas. O Copilot já pode consultar a Oplera.");
	} catch {
		setStatus("Informe uma URL HTTP ou HTTPS válida para a API Oplera.");
	}
});

load();
