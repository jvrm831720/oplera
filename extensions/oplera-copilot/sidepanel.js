const elements = {
	setup: document.getElementById("setup-state"),
	loading: document.getElementById("loading-state"),
	error: document.getElementById("error-state"),
	notFound: document.getElementById("not-found-state"),
	ambiguous: document.getElementById("ambiguous-state"),
	context: document.getElementById("context-state"),
};

const STATUS = {
	discovered: "Descoberta",
	eligible: "Elegível",
	planned: "Planejada",
	scheduled: "Agendada",
	contacted: "Contatada",
	awaiting_reply: "Aguardando resposta",
	engaged: "Em conversa",
	human_review: "Revisão humana",
	handed_off: "Encaminhada",
	recovered: "Recuperada",
	lost: "Perdida",
	suppressed: "Suprimida",
};

const POLICY = {
	allowed: "Permitido",
	blocked: "Bloqueado",
	requires_approval: "Requer aprovação",
};

const WINDOW = {
	open: "Janela de atendimento aberta",
	closed: "Fora da janela de atendimento",
	unknown: "Janela de atendimento desconhecida",
};

const SOURCE = {
	hubspot: "HubSpot",
	whatsapp: "WhatsApp",
	oplera: "Oplera",
};

const currency = (value, code = "BRL") =>
	new Intl.NumberFormat("pt-BR", {
		style: "currency",
		currency: code || "BRL",
	}).format(Number(value || 0));

const dateTime = (value) => {
	if (!value) return "Sem dados";
	const parsed = new Date(value);
	if (Number.isNaN(parsed.getTime())) return "Sem dados";
	return new Intl.DateTimeFormat("pt-BR", {
		day: "2-digit",
		month: "short",
		hour: "2-digit",
		minute: "2-digit",
		hour12: false,
	}).format(parsed);
};

function show(name) {
	for (const [key, element] of Object.entries(elements)) {
		element.classList.toggle("hidden", key !== name);
	}
}

function setText(id, value) {
	const element = document.getElementById(id);
	if (element) element.textContent = value ?? "—";
}

function storageGet(keys) {
	return chrome.storage.local.get(keys);
}

function storageSet(value) {
	return chrome.storage.local.set(value);
}

function normalizeBaseUrl(value) {
	return (value || "").trim().replace(/\/$/, "");
}

async function settings() {
	const stored = await storageGet([
		"apiBaseUrl",
		"accessToken",
		"conversationMappings",
	]);
	return {
		apiBaseUrl: normalizeBaseUrl(stored.apiBaseUrl),
		accessToken: (stored.accessToken || "").trim(),
		conversationMappings: stored.conversationMappings || {},
	};
}

async function api(path, init = {}) {
	const config = await settings();
	if (!config.apiBaseUrl || !config.accessToken)
		throw new Error("copilot_not_configured");
	const response = await fetch(`${config.apiBaseUrl}${path}`, {
		...init,
		headers: {
			"content-type": "application/json",
			authorization: `Bearer ${config.accessToken}`,
			...(init.headers || {}),
		},
	});
	const body = await response.json().catch(() => ({}));
	if (!response.ok) {
		const error = new Error(body.error || `http_${response.status}`);
		error.status = response.status;
		throw error;
	}
	return body;
}

async function activeWhatsAppContext() {
	const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
	if (!tab?.id || !tab.url?.startsWith("https://web.whatsapp.com/")) {
		return { tabId: null, title: null, phone: null, key: null };
	}
	try {
		const detected = await chrome.tabs.sendMessage(tab.id, {
			type: "OPLERA_DETECT_CONTEXT",
		});
		const title = detected?.title?.trim() || null;
		const phone = detected?.phone?.trim() || null;
		return {
			tabId: tab.id,
			title,
			phone,
			key: phone ? `phone:${phone}` : title ? `title:${title.toLowerCase()}` : null,
		};
	} catch {
		return { tabId: tab.id, title: null, phone: null, key: null };
	}
}

async function resolveCurrent(detected) {
	const config = await settings();
	if (detected.key && config.conversationMappings[detected.key]) {
		return {
			status: "resolved",
			match: { opportunityId: config.conversationMappings[detected.key] },
			matches: [],
		};
	}
	if (!detected.phone && !detected.title) return { status: "not_found", matches: [] };
	return api("/api/v0.5/copilot/resolve", {
		method: "POST",
		body: JSON.stringify({
			phone: detected.phone || undefined,
			name: detected.phone ? undefined : detected.title || undefined,
		}),
	});
}

async function saveMapping(key, opportunityId) {
	if (!key) return;
	const config = await settings();
	await storageSet({
		conversationMappings: {
			...config.conversationMappings,
			[key]: opportunityId,
		},
		lastSelection: opportunityId,
	});
}

function renderList(id, values, emptyText) {
	const container = document.getElementById(id);
	container.replaceChildren();
	const items = values?.length ? values : [emptyText];
	for (const value of items) {
		const li = document.createElement("li");
		li.textContent = value;
		container.appendChild(li);
	}
}

function renderTimeline(items) {
	const container = document.getElementById("timeline-list");
	container.replaceChildren();
	if (!items?.length) {
		const empty = document.createElement("p");
		empty.className = "hint";
		empty.textContent = "Sem atividade recente disponível.";
		container.appendChild(empty);
		return;
	}
	for (const item of items.slice(0, 8)) {
		const wrapper = document.createElement("div");
		wrapper.className = "timeline-item";
		const heading = document.createElement("strong");
		heading.textContent = `${SOURCE[item.source] || item.source} · ${dateTime(item.timestamp)}`;
		const summary = document.createElement("p");
		summary.textContent = item.summary;
		wrapper.append(heading, summary);
		container.appendChild(wrapper);
	}
}

function renderContext(context) {
	setText("contact-name", context.identity.name);
	setText("contact-company", context.identity.company);
	setText("score-badge", `Recovery Score ${context.recovery.score}`);
	setText("deal-name", context.deal.dealName);
	setText("deal-stage", context.deal.stage);
	setText("deal-amount", currency(context.deal.amount, context.deal.currency));
	setText("deal-owner", context.deal.owner);
	setText("recovery-status", STATUS[context.recovery.status] || context.recovery.status);
	setText("last-activity", dateTime(context.deal.lastActivityAt));
	setText("recovery-reason", context.nextBestAction.why);
	setText(
		"service-window",
		`${WINDOW[context.conversation.serviceWindowStatus] || "Janela de atendimento desconhecida"}${
			context.conversation.serviceWindowExpiresAt
				? ` · até ${dateTime(context.conversation.serviceWindowExpiresAt)}`
				: ""
		}`,
	);
	setText("policy-badge", POLICY[context.policies.result] || context.policies.result);
	renderList("signals-list", context.signals, "Sem sinais recentes relevantes.");
	setText("next-title", context.nextBestAction.title);
	setText("next-description", context.nextBestAction.description);
	setText("next-why", context.nextBestAction.why);
	renderList(
		"evidence-list",
		context.nextBestAction.evidence,
		"Sem evidências adicionais disponíveis.",
	);
	renderTimeline(context.timeline);

	const approval = document.getElementById("approval-warning");
	approval.classList.toggle("hidden", !context.nextBestAction.requiresApproval);

	const copy = document.getElementById("copy-message");
	const canCopy =
		Boolean(context.nextBestAction.suggestedMessage) &&
		context.nextBestAction.policyResult === "allowed";
	copy.classList.toggle("hidden", !canCopy);
	copy.onclick = canCopy
		? async () => {
				await navigator.clipboard.writeText(context.nextBestAction.suggestedMessage);
				copy.textContent = "Mensagem copiada";
				setTimeout(() => {
					copy.textContent = "Copiar mensagem";
				}, 1400);
			}
		: null;

	const hubspot = document.getElementById("open-hubspot");
	hubspot.classList.toggle("hidden", !context.links?.hubspot);
	hubspot.onclick = context.links?.hubspot
		? () => chrome.tabs.create({ url: context.links.hubspot })
		: null;
	show("context");
}

async function loadContext(opportunityId, mappingKey) {
	show("loading");
	const context = await api(
		`/api/v0.5/copilot/context/${encodeURIComponent(opportunityId)}`,
	);
	await saveMapping(mappingKey, opportunityId);
	renderContext(context);
}

function renderAmbiguous(matches, detected) {
	const list = document.getElementById("ambiguous-list");
	list.replaceChildren();
	for (const match of matches) {
		const button = document.createElement("button");
		button.type = "button";
		button.className = "match-button";
		const title = document.createElement("strong");
		title.textContent = match.name;
		const details = document.createElement("span");
		details.textContent = `${match.company} · ${match.dealName} · ${currency(match.amount)}`;
		button.append(title, details);
		button.addEventListener("click", () =>
			loadContext(match.opportunityId, detected?.key).catch(showError),
		);
		list.appendChild(button);
	}
	show("ambiguous");
}

function showError(error) {
	if (error?.message === "copilot_not_configured") {
		show("setup");
		return;
	}
	const messages = {
		unauthorized: "Token do Copilot inválido. Revise as configurações do piloto.",
		copilot_origin_not_allowed:
			"Esta extensão não está na lista de origins permitidas pelo backend Oplera.",
		copilot_context_not_found: "O contexto comercial solicitado não foi encontrado.",
	};
	setText(
		"error-message",
		messages[error?.message] || "Verifique a conexão com a Oplera e tente novamente.",
	);
	show("error");
}

async function processResolution(result, detected) {
	if (result.status === "resolved") {
		await loadContext(result.match.opportunityId, detected?.key);
		return;
	}
	if (result.status === "ambiguous") {
		renderAmbiguous(result.matches, detected);
		return;
	}
	show("notFound");
}

async function refresh() {
	try {
		const config = await settings();
		if (!config.apiBaseUrl || !config.accessToken) {
			show("setup");
			return;
		}
		show("loading");
		const detected = await activeWhatsAppContext();
		const resolution = await resolveCurrent(detected);
		await processResolution(resolution, detected);
	} catch (error) {
		showError(error);
	}
}

document.getElementById("refresh").addEventListener("click", refresh);
document.getElementById("retry").addEventListener("click", refresh);
document.getElementById("open-options").addEventListener("click", () =>
	chrome.runtime.openOptionsPage(),
);

document.getElementById("search-form").addEventListener("submit", async (event) => {
	event.preventDefault();
	const query = document.getElementById("search-query").value.trim();
	if (!query) return;
	try {
		show("loading");
		const detected = await activeWhatsAppContext();
		const result = await api("/api/v0.5/copilot/resolve", {
			method: "POST",
			body: JSON.stringify({ query }),
		});
		await processResolution(result, detected);
	} catch (error) {
		showError(error);
	}
});

refresh();
