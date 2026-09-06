import { ExternalLink, Search, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
import type {
	CopilotResolveMatch,
	CopilotResolveResult,
	SellerCopilotContext,
} from "../../../api/copilot/types.ts";
import { Badge } from "../../components/ui/badge.tsx";
import { Button } from "../../components/ui/button.tsx";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "../../components/ui/card.tsx";
import { Input } from "../../components/ui/input.tsx";
import {
	brlCurrency,
	compactDateTime,
	policyResultLabel,
	recoveryStatusLabel,
	serviceWindowLabel,
	strategyLabel,
} from "../../lib/pt-br.ts";

const DEMO_CONTEXT: SellerCopilotContext = {
	identity: {
		contactId: "demo-contact-mariana",
		name: "Mariana Costa",
		phone: "+55 21 99999-9999",
		email: "mariana@clinicaaurora.example",
		role: "Diretora de Operações",
		companyId: "demo-company-aurora",
		company: "Clínica Aurora",
	},
	deal: {
		dealId: "demo-deal-aurora",
		dealName: "Expansão atendimento digital",
		stage: "Proposta enviada",
		amount: 18_500,
		currency: "BRL",
		owner: "Rafael Mendes",
		lastActivityAt: "2026-09-06T16:52:00-03:00",
	},
	recovery: {
		status: "engaged",
		score: 87,
		reasonCode: "lost_timing",
		attempt: 1,
		strategy: "timing_reactivation",
		nextTask: null,
		dueAt: null,
	},
	conversation: {
		lastInboundAt: "2026-09-06T16:52:00-03:00",
		lastOutboundAt: "2026-08-14T14:30:00-03:00",
		lastInboundPreview:
			"Quero retomar o projeto no próximo mês. Preciso confirmar internamente a melhor data para decidir.",
		lastOutboundPreview: "Enviei a proposta aprovada para sua revisão.",
		detectedIntent: "objection",
		objection: "timing",
		serviceWindowStatus: "open",
		serviceWindowExpiresAt: "2026-09-07T16:52:00-03:00",
	},
	policies: {
		result: "allowed",
		reasons: ["policy_passed"],
		requiresApproval: false,
	},
	signals: [
		"WhatsApp recebido há poucos minutos.",
		"Proposta já enviada.",
		"Objeção de timing identificada.",
		"Oportunidade continua aberta.",
	],
	timeline: [
		{
			id: "demo-timeline-1",
			type: "mensagem_recebida",
			source: "whatsapp",
			timestamp: "2026-09-06T16:52:00-03:00",
			summary: "Informou intenção de retomar o projeto no próximo mês.",
		},
		{
			id: "demo-timeline-2",
			type: "proposta",
			source: "hubspot",
			timestamp: "2026-08-14T14:00:00-03:00",
			summary: "Proposta comercial registrada no HubSpot.",
		},
		{
			id: "demo-timeline-3",
			type: "reunião",
			source: "hubspot",
			timestamp: "2026-08-06T11:00:00-03:00",
			summary: "Reunião comercial com sinal positivo e objeção de timing.",
		},
	],
	nextBestAction: {
		type: "timing_confirm",
		title: "Confirmar a janela de decisão",
		description:
			"Valide quando a oportunidade pretende retomar a decisão e mantenha o próximo contato ancorado nesse momento.",
		urgency: "high",
		why: "A principal objeção identificada é timing e o contato indicou intenção de retomar o projeto.",
		evidence: [
			"Resposta recebida no WhatsApp.",
			"Objeção de timing identificada.",
			"Negócio continua aberto no HubSpot.",
		],
		policyResult: "allowed",
		requiresApproval: false,
		suggestedMessage:
			"Quando você pensa em retomar essa decisão no próximo mês? Posso me organizar para falar com você no momento certo.",
	},
	freshness: {
		hubspot: "2026-09-06T16:53:00-03:00",
		whatsapp: "2026-09-06T16:52:00-03:00",
		oplera: "2026-09-06T16:53:00-03:00",
	},
	links: { hubspot: null },
};

function AuthorizationField({
	token,
	onTokenChange,
}: {
	token: string;
	onTokenChange: (value: string) => void;
}) {
	return (
		<div className="grid gap-1.5">
			<label htmlFor="copilot-token" className="text-xs font-medium">
				Token do Copilot
			</label>
			<Input
				id="copilot-token"
				type="password"
				autoComplete="off"
				value={token}
				onChange={(event) => onTokenChange(event.currentTarget.value)}
				placeholder="Cole o token de acesso do piloto"
			/>
			<p className="text-[10px] text-muted-foreground">
				O token fica apenas nesta sessão do navegador e não é incorporado ao frontend.
			</p>
		</div>
	);
}

function ContextView({ context }: { context: SellerCopilotContext }) {
	const [copied, setCopied] = useState(false);
	const canCopy =
		Boolean(context.nextBestAction.suggestedMessage) &&
		context.nextBestAction.policyResult === "allowed";

	const copyMessage = async () => {
		if (!canCopy || !context.nextBestAction.suggestedMessage) return;
		await navigator.clipboard.writeText(context.nextBestAction.suggestedMessage);
		setCopied(true);
		window.setTimeout(() => setCopied(false), 1400);
	};

	return (
		<div className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(360px,1.1fr)]">
			<div className="space-y-4">
				<Card>
					<CardHeader>
						<div className="flex flex-wrap items-start justify-between gap-3">
							<div>
								<CardTitle>{context.identity.name}</CardTitle>
								<CardDescription>{context.identity.company}</CardDescription>
							</div>
							<Badge variant="mono">Recovery Score {context.recovery.score}</Badge>
						</div>
					</CardHeader>
					<CardContent className="grid gap-4 text-xs sm:grid-cols-2">
						<div>
							<p className="text-muted-foreground">Cargo</p>
							<p className="mt-1 font-medium">{context.identity.role ?? "Sem dados"}</p>
						</div>
						<div>
							<p className="text-muted-foreground">Status</p>
							<div className="mt-1">
								<Badge variant="token">
									{recoveryStatusLabel(context.recovery.status)}
								</Badge>
							</div>
						</div>
						<div>
							<p className="text-muted-foreground">Telefone</p>
							<p className="mt-1 font-medium">{context.identity.phone ?? "Sem dados"}</p>
						</div>
						<div>
							<p className="text-muted-foreground">E-mail</p>
							<p className="mt-1 break-all font-medium">{context.identity.email ?? "Sem dados"}</p>
						</div>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>Oportunidade</CardTitle>
						<CardDescription>Contexto comercial essencial do HubSpot.</CardDescription>
					</CardHeader>
					<CardContent className="grid gap-4 text-xs sm:grid-cols-2">
						<div className="sm:col-span-2">
							<p className="text-muted-foreground">Negócio</p>
							<p className="mt-1 font-medium">{context.deal.dealName}</p>
						</div>
						<div>
							<p className="text-muted-foreground">Estágio</p>
							<p className="mt-1 font-medium">{context.deal.stage}</p>
						</div>
						<div>
							<p className="text-muted-foreground">Valor</p>
							<p className="mt-1 font-medium">
								{new Intl.NumberFormat("pt-BR", {
									style: "currency",
									currency: context.deal.currency || "BRL",
								}).format(context.deal.amount)}
							</p>
						</div>
						<div>
							<p className="text-muted-foreground">Responsável</p>
							<p className="mt-1 font-medium">{context.deal.owner || "Sem dados"}</p>
						</div>
						<div>
							<p className="text-muted-foreground">Última atividade</p>
							<p className="mt-1 font-medium">
								{compactDateTime.format(new Date(context.deal.lastActivityAt))}
							</p>
						</div>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>Contexto de Receita</CardTitle>
					</CardHeader>
					<CardContent className="space-y-3 text-xs">
						<div className="flex items-center justify-between gap-3 border-b pb-2">
							<span className="text-muted-foreground">Estratégia</span>
							<span className="text-right font-medium">
								{strategyLabel(context.recovery.strategy)}
							</span>
						</div>
						<div className="flex items-center justify-between gap-3 border-b pb-2">
							<span className="text-muted-foreground">Janela do WhatsApp</span>
							<span className="text-right font-medium">
								{serviceWindowLabel(context.conversation.serviceWindowStatus)}
							</span>
						</div>
						<div className="flex items-center justify-between gap-3">
							<span className="text-muted-foreground">Política</span>
							<Badge variant={context.policies.result === "blocked" ? "outline" : "token"}>
								{policyResultLabel(context.policies.result)}
							</Badge>
						</div>
						{context.policies.requiresApproval ? (
							<p className="rounded-md border bg-muted/40 p-2.5 text-muted-foreground">
								Requer aprovação antes de qualquer ação de contato.
							</p>
						) : null}
					</CardContent>
				</Card>
			</div>

			<div className="space-y-4">
				<Card className="border-primary/30">
					<CardHeader>
						<div className="flex items-center gap-2 text-xs text-muted-foreground">
							<ShieldCheck className="size-4" /> Próximo melhor passo
						</div>
						<CardTitle className="text-lg">{context.nextBestAction.title}</CardTitle>
						<CardDescription>{context.nextBestAction.description}</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						<div>
							<p className="text-xs font-medium">Por quê</p>
							<p className="mt-1 text-sm leading-6 text-muted-foreground">
								{context.nextBestAction.why}
							</p>
						</div>
						<div>
							<p className="text-xs font-medium">Evidências</p>
							<ul className="mt-2 space-y-2 text-xs text-muted-foreground">
								{context.nextBestAction.evidence.map((item) => (
									<li key={item} className="flex gap-2">
										<span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
										<span>{item}</span>
									</li>
								))}
							</ul>
						</div>
						<div className="flex flex-wrap gap-2">
							{canCopy ? (
								<Button type="button" size="sm" onClick={copyMessage}>
									{copied ? "Mensagem copiada" : "Copiar mensagem"}
								</Button>
							) : null}
							{context.links.hubspot ? (
								<Button type="button" size="sm" variant="outline" asChild>
									<a href={context.links.hubspot} target="_blank" rel="noreferrer">
										<ExternalLink className="size-3.5" /> Abrir no HubSpot
									</a>
								</Button>
							) : null}
						</div>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>Últimos sinais</CardTitle>
						<CardDescription>Somente sinais úteis para conduzir a oportunidade.</CardDescription>
					</CardHeader>
					<CardContent>
						<ul className="space-y-2 text-xs">
							{context.signals.length ? (
								context.signals.slice(0, 8).map((signal) => (
									<li key={signal} className="flex gap-2">
										<span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
										<span>{signal}</span>
									</li>
								))
							) : (
								<li className="text-muted-foreground">Sem sinais recentes relevantes.</li>
							)}
						</ul>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>Atividade recente</CardTitle>
					</CardHeader>
					<CardContent className="divide-y border-y px-0">
						{context.timeline.slice(0, 6).map((item) => (
							<div key={item.id} className="px-6 py-3">
								<p className="text-xs font-medium">{item.summary}</p>
								<p className="mt-1 text-[10px] text-muted-foreground">
									{item.source === "hubspot"
										? "HubSpot"
										: item.source === "whatsapp"
											? "WhatsApp"
											: "Oplera"} · {compactDateTime.format(new Date(item.timestamp))}
								</p>
							</div>
						))}
					</CardContent>
				</Card>
			</div>
		</div>
	);
}

export default function SellerCopilotPage({ demoMode = false }: { demoMode?: boolean }) {
	const [token, setToken] = useState("");
	const [query, setQuery] = useState("");
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [context, setContext] = useState<SellerCopilotContext | null>(
		demoMode ? DEMO_CONTEXT : null,
	);
	const [matches, setMatches] = useState<CopilotResolveMatch[]>([]);
	const status = useMemo(() => {
		if (loading) return "loading";
		if (error) return "error";
		if (matches.length) return "ambiguous";
		if (context) return "context";
		return "idle";
	}, [context, error, loading, matches]);

	const headers = () => ({
		"content-type": "application/json",
		authorization: `Bearer ${token.trim()}`,
	});

	const loadContext = async (opportunityId: string) => {
		const response = await fetch(
			`/api/v0.5/copilot/context/${encodeURIComponent(opportunityId)}`,
			{ headers: headers() },
		);
		if (!response.ok) throw new Error(response.status === 401 ? "token" : "contexto");
		setContext((await response.json()) as SellerCopilotContext);
		setMatches([]);
	};

	const resolve = async (event: React.FormEvent) => {
		event.preventDefault();
		const trimmed = query.trim();
		if (!trimmed) return;
		setLoading(true);
		setError(null);
		setMatches([]);
		try {
			if (demoMode) {
				const normalized = trimmed.toLocaleLowerCase("pt-BR");
				if (["mariana", "mariana costa", "clínica aurora", "clinica aurora"].some((item) => normalized.includes(item))) {
					setContext(DEMO_CONTEXT);
				} else {
					setContext(null);
					setError("Contato não encontrado na demonstração local.");
				}
				return;
			}
			if (token.trim().length < 32) {
				setError("Informe o token do Copilot para consultar a Oplera.");
				return;
			}
			const response = await fetch("/api/v0.5/copilot/resolve", {
				method: "POST",
				headers: headers(),
				body: JSON.stringify({ query: trimmed }),
			});
			if (!response.ok) throw new Error(response.status === 401 ? "token" : "resolução");
			const result = (await response.json()) as CopilotResolveResult;
			if (result.status === "resolved") {
				await loadContext(result.match.opportunityId);
				return;
			}
			setContext(null);
			if (result.status === "ambiguous") {
				setMatches(result.matches);
				return;
			}
			setError("Contato não encontrado na Oplera.");
		} catch (failure) {
			setContext(null);
			setError(
				failure instanceof Error && failure.message === "token"
					? "Token do Copilot inválido."
					: "Não foi possível carregar o contexto.",
			);
		} finally {
			setLoading(false);
		}
	};

	return (
		<div className="flex flex-col gap-6">
		<div className="flex flex-col gap-1">
			<div className="flex flex-wrap items-center gap-2">
				<h1 className="font-medium text-2xl tracking-tight">Copilot do Vendedor</h1>
				{demoMode ? <Badge variant="outline">Cenário de demonstração</Badge> : null}
			</div>
			<p className="max-w-3xl text-sm text-muted-foreground">
				Busque um contato para visualizar contexto comercial e o próximo melhor passo. O Copilot é somente leitura e não altera CRM nem envia mensagens.
			</p>
		</div>

		<Card>
			<CardHeader>
				<CardTitle>Buscar contato</CardTitle>
				<CardDescription>Use nome, telefone ou e-mail já existente no HubSpot.</CardDescription>
			</CardHeader>
			<CardContent>
				<form className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.55fr)_auto] lg:items-end" onSubmit={resolve}>
					<div className="grid gap-1.5">
						<label htmlFor="copilot-search" className="text-xs font-medium">Buscar contato</label>
						<Input
							id="copilot-search"
							value={query}
							onChange={(event) => setQuery(event.currentTarget.value)}
							placeholder="Nome, telefone ou e-mail"
						/>
					</div>
					{demoMode ? (
						<div className="rounded-md border bg-muted/35 px-3 py-2.5 text-xs text-muted-foreground">
							Use “Mariana Costa” para repetir o cenário local.
						</div>
					) : (
						<AuthorizationField token={token} onTokenChange={setToken} />
					)}
					<Button type="submit" disabled={loading}>
						<Search className="size-4" /> {loading ? "Buscando..." : "Buscar"}
					</Button>
				</form>
			</CardContent>
		</Card>

		{status === "ambiguous" ? (
			<Card>
				<CardHeader>
					<CardTitle>Encontramos mais de um contato</CardTitle>
					<CardDescription>Selecione o registro correto para carregar o contexto.</CardDescription>
				</CardHeader>
				<CardContent className="grid gap-2">
					{matches.map((match) => (
						<Button
							key={match.opportunityId}
							type="button"
							variant="outline"
							className="h-auto justify-between gap-4 py-3 text-left"
							onClick={() => loadContext(match.opportunityId).catch(() => setError("Não foi possível carregar o contexto."))}
						>
							<span>
								<strong className="block text-xs">{match.name}</strong>
								<span className="text-[10px] text-muted-foreground">{match.company} · {match.dealName}</span>
							</span>
							<span className="text-xs">{brlCurrency.format(match.amount)}</span>
						</Button>
					))}
				</CardContent>
			</Card>
		) : null}

		{status === "error" && error ? (
			<div className="rounded-lg border bg-card p-4 text-sm">
				<p className="font-medium">{error}</p>
				<p className="mt-1 text-xs text-muted-foreground">Revise a busca ou a configuração de acesso e tente novamente.</p>
			</div>
		) : null}

		{status === "loading" ? (
			<div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">Carregando contexto comercial...</div>
		) : null}

		{context ? <ContextView context={context} /> : null}
		</div>
	);
}
