chrome.runtime.onInstalled.addListener(() => {
	chrome.sidePanel
		.setPanelBehavior({ openPanelOnActionClick: true })
		.catch((error) => console.error("Não foi possível configurar o painel lateral.", error));
});
