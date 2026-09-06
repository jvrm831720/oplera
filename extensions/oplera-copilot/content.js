function normalize(value) {
	return (value || "").replace(/\s+/g, " ").trim();
}

function visibleText(element) {
	if (!(element instanceof HTMLElement)) return "";
	if (element.offsetParent === null) return "";
	return normalize(element.getAttribute("title") || element.textContent || "");
}

function detectCurrentConversation(root = document) {
	const header = root.querySelector("header");
	if (!header) return { title: null, phone: null, pageTitle: root.title };

	const candidates = [
		...header.querySelectorAll("[title]"),
		...header.querySelectorAll('span[dir="auto"]'),
	]
		.map(visibleText)
		.filter((value) => value && value.length <= 160);
	const title =
		candidates.find((value) => !/^\d{1,2}:\d{2}$/.test(value)) || null;
	const phoneMatch = title?.match(/\+?\d[\d\s().-]{7,}\d/);
	return {
		title,
		phone: phoneMatch ? phoneMatch[0] : null,
		pageTitle: root.title,
	};
}

globalThis.OpleraCopilotDetector = { detectCurrentConversation };

if (typeof chrome !== "undefined" && chrome.runtime?.onMessage) {
	chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
		if (message?.type !== "OPLERA_DETECT_CONTEXT") return false;
		sendResponse(detectCurrentConversation());
		return false;
	});
}
