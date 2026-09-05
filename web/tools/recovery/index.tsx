import {
	ArrowDownToLine,
	BadgeDollarSign,
	Check,
	ChevronRight,
	CircleAlert,
	Clock3,
	Copy,
	FileUp,
	MessageCircleMore,
	ShieldCheck,
	Sparkles,
	Target,
	TrendingUp,
} from "lucide-react";
import { useState } from "react";
import { parseConversationCsv } from "../../../api/domain/csv.ts";
import type {
	RecoveryAnalysis,
	RecoveryOpportunity,
} from "../../../api/domain/recovery.ts";
import {
	analyzeRecoveryPipeline,
	sampleConversations,
} from "../../../api/domain/recovery.ts";
import type {
	AnalyzeRecoveryInput,
	AnalyzeRecoveryOutput,
} from "../../../api/tools/analyze-recovery.ts";
import { useMcpApp, useMcpState } from "../../context.tsx";

const number = new Intl.NumberFormat("pt-BR");
const currency = new Intl.NumberFormat("pt-BR", {
	style: "currency",
	currency: "BRL",
	maximumFractionDigits: 0,
});

type Filter = "all" | "high" | "medium";

function buildDemoAnalysis(): RecoveryAnalysis {
	const now = new Date();
	return analyzeRecoveryPipeline({
		companyName: "Clínica Aurora",
		conversations: sampleConversations(now),
		referenceDate: now.toISOString(),
		isSample: true,
	});
}

function priorityLabel(priority: RecoveryOpportunity["priority"]): string {
	if (priority === "high") return "Alta prioridade";
	if (priority === "medium") return "Média prioridade";
	return "Baixa prioridade";
}

function priorityClasses(priority: RecoveryOpportunity["priority"]): string {
	if (priority === "high")
		return "bg-[#ffede8] text-[#ad351f] border-[#ffd0c5]";
	if (priority === "medium")
		return "bg-[#fff7dc] text-[#835d00] border-[#f4dda0]";
	return "bg-[#edf7f3] text-[#176c4c] border-[#cbeadd]";
}

function MetricCard({
	label,
	value,
	detail,
	icon: Icon,
	emphasis = false,
}: {
	label: string;
	value: string;
	detail: string;
	icon: React.ComponentType<{ className?: string }>;
	emphasis?: boolean;
}) {
	return (
		<div
			className={`rounded-2xl border p-5 ${
				emphasis ? "border-[#bbef67] bg-[#eaffc8]" : "border-[#e6e5df] bg-white"
			}`}
		>
			<div className="mb-6 flex items-start justify-between gap-4">
				<p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#74736c]">
					{label}
				</p>
				<div className="rounded-full border border-black/10 bg-white/70 p-2">
					<Icon className="size-4 text-[#1f211d]" />
				</div>
			</div>
			<p className="text-3xl font-semibold tracking-[-0.04em] text-[#171815]">
				{value}
			</p>
			<p className="mt-1 text-xs text-[#74736c]">{detail}</p>
		</div>
	);
}

function EmptyState() {
	return (
		<div className="flex min-h-dvh items-center justify-center bg-[#f6f5f0] p-6">
			<div className="max-w-md rounded-3xl border border-[#e2e0d8] bg-white p-8 text-center shadow-sm">
				<div className="mx-auto mb-5 flex size-12 items-center justify-center rounded-2xl bg-[#eaffc8]">
					<Target className="size-6" />
				</div>
				<h1 className="text-2xl font-semibold tracking-tight">
					Oplera Revenue
				</h1>
				<p className="mt-3 text-sm leading-6 text-[#6d6c65]">
					Conectado. Peça ao agente para analisar a recuperação de receita ou
					acesse <strong>/demo</strong> para abrir a demonstração.
				</p>
			</div>
		</div>
	);
}

function LoadingState({ label }: { label: string }) {
	return (
		<div className="flex min-h-dvh items-center justify-center bg-[#f6f5f0] p-6">
			<div className="flex items-center gap-3 text-sm text-[#64635d]">
				<span className="size-4 animate-spin rounded-full border-2 border-[#c7c6bf] border-t-[#171815]" />
				{label}
			</div>
		</div>
	);
}

export default function RecoveryPage() {
	const state = useMcpState<AnalyzeRecoveryInput, AnalyzeRecoveryOutput>();
	const app = useMcpApp();
	const isDemo = window.location.pathname === "/demo";
	const [localAnalysis, setLocalAnalysis] = useState<RecoveryAnalysis | null>(
		isDemo ? buildDemoAnalysis() : null,
	);
	const [filter, setFilter] = useState<Filter>("all");
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [copiedId, setCopiedId] = useState<string | null>(null);
	const [queuedIds, setQueuedIds] = useState<string[]>([]);
	const [importError, setImportError] = useState<string | null>(null);

	if (!isDemo && state.status === "initializing") {
		return <LoadingState label="Conectando ao Deco Studio..." />;
	}
	if (!isDemo && state.status === "tool-input") {
		return <LoadingState label="Analisando conversas comerciais..." />;
	}
	if (!isDemo && state.status === "connected") return <EmptyState />;
	if (!isDemo && state.status === "error") {
		return (
			<div className="flex min-h-dvh items-center justify-center bg-[#f6f5f0] p-6">
				<div className="max-w-lg rounded-2xl border border-red-200 bg-white p-6">
					<p className="font-semibold text-red-700">
						Não foi possível analisar
					</p>
					<p className="mt-2 text-sm text-red-600">{state.error}</p>
				</div>
			</div>
		);
	}

	const analysis = localAnalysis ?? state.toolResult;
	if (!analysis) return <EmptyState />;

	const opportunities = analysis.opportunities.filter((opportunity) =>
		filter === "all" ? true : opportunity.priority === filter,
	);
	const selected =
		analysis.opportunities.find((item) => item.id === selectedId) ??
		opportunities[0];

	async function importCsv(file: File | undefined) {
		if (!file) return;
		try {
			const conversations = parseConversationCsv(await file.text());
			setLocalAnalysis(
				analyzeRecoveryPipeline({
					companyName: file.name.replace(/\.csv$/i, ""),
					conversations,
				}),
			);
			setSelectedId(null);
			setImportError(null);
		} catch (error) {
			setImportError(
				error instanceof Error
					? error.message
					: "Não foi possível importar o CSV.",
			);
		}
	}

	function downloadTemplate() {
		const csv = `conversation_id,contact_name,phone,owner,source,estimated_value,direction,message,timestamp\nopp-001,Ana Souza,5521999999999,Beatriz,Meta Ads,3500,inbound,"Quanto custa e como posso pagar?",2026-09-01T10:00:00.000Z`;
		const href = URL.createObjectURL(
			new Blob([csv], { type: "text/csv;charset=utf-8" }),
		);
		const anchor = document.createElement("a");
		anchor.href = href;
		anchor.download = "oplera-modelo-conversas.csv";
		anchor.click();
		URL.revokeObjectURL(href);
	}

	async function copyMessage(opportunity: RecoveryOpportunity) {
		await navigator.clipboard.writeText(opportunity.suggestedMessage);
		setCopiedId(opportunity.id);
	}

	function queueOpportunity(opportunity: RecoveryOpportunity) {
		if (!queuedIds.includes(opportunity.id)) {
			setQueuedIds([...queuedIds, opportunity.id]);
		}
		app?.sendMessage({
			role: "user",
			content: [
				{
					type: "text",
					text: `Prepare a retomada da oportunidade ${opportunity.id}, de ${opportunity.contactName}. Não envie nada ainda. Valide o texto, a janela de atendimento do WhatsApp e se um template aprovado é necessário.`,
				},
			],
		});
	}

	return (
		<div className="min-h-dvh bg-[#f6f5f0] text-[#171815]">
			<header className="border-b border-[#deddd6] bg-[#171815] text-white">
				<div className="mx-auto flex max-w-[1500px] items-center justify-between gap-6 px-5 py-4 md:px-8">
					<div className="flex items-center gap-3">
						<div className="flex size-9 items-center justify-center rounded-xl bg-[#c6ff69] text-sm font-black text-[#171815]">
							O
						</div>
						<div>
							<p className="text-sm font-semibold tracking-[0.06em]">OPLERA</p>
							<p className="text-[11px] text-white/55">Revenue Recovery</p>
						</div>
					</div>
					<div className="flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-[11px] text-white/70">
						<span className="size-1.5 rounded-full bg-[#c6ff69]" />
						Análise concluída
					</div>
				</div>
			</header>

			<main className="mx-auto max-w-[1500px] px-5 py-7 md:px-8 md:py-10">
				<section className="mb-7 flex flex-col justify-between gap-5 xl:flex-row xl:items-end">
					<div>
						<div className="mb-3 flex flex-wrap items-center gap-2">
							<span className="rounded-full border border-[#d8d6ce] bg-white px-3 py-1 text-[11px] font-medium text-[#5e5d57]">
								{analysis.companyName}
							</span>
							{analysis.isSample ? (
								<span className="rounded-full border border-[#d9efb6] bg-[#f3ffe1] px-3 py-1 text-[11px] font-medium text-[#426b00]">
									Dados fictícios
								</span>
							) : null}
						</div>
						<h1 className="max-w-3xl text-3xl font-semibold tracking-[-0.045em] md:text-5xl">
							Receita que já estava na sua operação.
						</h1>
						<p className="mt-3 max-w-2xl text-sm leading-6 text-[#6d6c65] md:text-base">
							Encontramos conversas com intenção comercial que ficaram sem o
							próximo passo correto.
						</p>
					</div>
					<div className="flex flex-wrap gap-2">
						<button
							type="button"
							onClick={downloadTemplate}
							className="inline-flex items-center gap-2 rounded-xl border border-[#d8d6ce] bg-white px-4 py-2.5 text-xs font-semibold hover:bg-[#f0efe9]"
						>
							<ArrowDownToLine className="size-4" /> Baixar modelo
						</button>
						<label className="inline-flex items-center gap-2 rounded-xl bg-[#171815] px-4 py-2.5 text-xs font-semibold text-white hover:bg-black">
							<FileUp className="size-4" /> Importar CSV
							<input
								type="file"
								accept=".csv,text/csv"
								className="sr-only"
								onChange={(event) => void importCsv(event.target.files?.[0])}
							/>
						</label>
					</div>
				</section>

				{importError ? (
					<div className="mb-5 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
						<CircleAlert className="mt-0.5 size-4 shrink-0" /> {importError}
					</div>
				) : null}

				<section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
					<MetricCard
						label="Pipeline potencial"
						value={currency.format(analysis.summary.estimatedPipeline)}
						detail="valor estimado em conversas priorizadas"
						icon={TrendingUp}
						emphasis
					/>
					<MetricCard
						label="Oportunidades"
						value={number.format(analysis.summary.recoverableCount)}
						detail={`de ${analysis.summary.totalConversations} conversas analisadas`}
						icon={Target}
					/>
					<MetricCard
						label="Alta prioridade"
						value={number.format(analysis.summary.highPriorityCount)}
						detail="para revisão comercial imediata"
						icon={Sparkles}
					/>
					<MetricCard
						label="Exigem template"
						value={number.format(analysis.summary.needsTemplateCount)}
						detail="fora da janela livre do WhatsApp"
						icon={ShieldCheck}
					/>
				</section>

				<section className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(360px,0.75fr)]">
					<div className="overflow-hidden rounded-2xl border border-[#e1dfd7] bg-white">
						<div className="flex flex-col justify-between gap-4 border-b border-[#e8e6df] px-5 py-4 sm:flex-row sm:items-center">
							<div>
								<h2 className="text-sm font-semibold">Fila de recuperação</h2>
								<p className="mt-0.5 text-xs text-[#77766f]">
									Ordenada por intenção, abandono e valor potencial
								</p>
							</div>
							<div className="flex rounded-lg bg-[#f1f0eb] p-1">
								{(["all", "high", "medium"] as const).map((item) => (
									<button
										type="button"
										key={item}
										onClick={() => setFilter(item)}
										className={`rounded-md px-3 py-1.5 text-[11px] font-semibold ${filter === item ? "bg-white shadow-sm" : "text-[#77766f]"}`}
									>
										{item === "all"
											? "Todas"
											: item === "high"
												? "Alta"
												: "Média"}
									</button>
								))}
							</div>
						</div>

						<div className="divide-y divide-[#eceae4]">
							{opportunities.map((opportunity) => (
								<button
									type="button"
									key={opportunity.id}
									onClick={() => setSelectedId(opportunity.id)}
									className={`grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-[#faf9f5] ${selected?.id === opportunity.id ? "bg-[#f7fce9]" : ""}`}
								>
									<div className="min-w-0">
										<div className="mb-2 flex flex-wrap items-center gap-2">
											<p className="truncate text-sm font-semibold">
												{opportunity.contactName}
											</p>
											<span
												className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${priorityClasses(opportunity.priority)}`}
											>
												{priorityLabel(opportunity.priority)}
											</span>
											{queuedIds.includes(opportunity.id) ? (
												<span className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#497600]">
													<Check className="size-3" /> Em revisão
												</span>
											) : null}
										</div>
										<p className="line-clamp-1 text-xs text-[#77766f]">
											{opportunity.reason}
										</p>
										<div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-[#929088]">
											<span>{opportunity.source}</span>
											<span>{opportunity.owner}</span>
											<span>{opportunity.inactivityDays} dias sem avanço</span>
										</div>
									</div>
									<div className="flex items-center gap-3">
										<div className="text-right">
											<p className="text-sm font-semibold">
												{currency.format(opportunity.estimatedValue)}
											</p>
											<p className="text-[10px] text-[#77766f]">
												score heurístico {opportunity.score}/100
											</p>
										</div>
										<ChevronRight className="size-4 text-[#aaa8a0]" />
									</div>
								</button>
							))}
							{opportunities.length === 0 ? (
								<div className="p-10 text-center text-sm text-[#77766f]">
									Nenhuma oportunidade neste filtro.
								</div>
							) : null}
						</div>
					</div>

					{selected ? (
						<aside className="self-start overflow-hidden rounded-2xl border border-[#e1dfd7] bg-white xl:sticky xl:top-5">
							<div className="border-b border-[#e8e6df] p-5">
								<div className="flex items-start justify-between gap-4">
									<div>
										<p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#85837b]">
											Próxima melhor ação
										</p>
										<h2 className="mt-2 text-xl font-semibold tracking-tight">
											{selected.contactName}
										</h2>
									</div>
									<div className="rounded-xl bg-[#eaffc8] px-3 py-2 text-center">
										<p className="text-lg font-bold leading-none">
											{selected.score}
										</p>
										<p className="mt-1 text-[9px] font-semibold uppercase">
											heurístico
										</p>
									</div>
								</div>
								<div className="mt-4 flex flex-wrap gap-2">
									{selected.intentSignals.map((signal) => (
										<span
											key={signal}
											className="rounded-md bg-[#f0efe9] px-2 py-1 text-[10px] font-medium"
										>
											{signal}
										</span>
									))}
								</div>
							</div>

							<div className="space-y-5 p-5">
								<div>
									<div className="mb-2 flex items-center gap-2 text-xs font-semibold">
										<Clock3 className="size-4" /> Por que agora
									</div>
									<p className="text-xs leading-5 text-[#6f6e67]">
										{selected.reason}
									</p>
								</div>

								<div className="rounded-xl border border-[#e6e4dd] bg-[#faf9f5] p-4">
									<div className="mb-3 flex items-center gap-2 text-xs font-semibold">
										<MessageCircleMore className="size-4" /> Retomada sugerida
									</div>
									<p className="text-xs leading-5 text-[#575650]">
										{selected.suggestedMessage}
									</p>
									<button
										type="button"
										onClick={() => void copyMessage(selected)}
										className="mt-4 inline-flex items-center gap-2 text-[11px] font-semibold text-[#4d4c47]"
									>
										{copiedId === selected.id ? (
											<Check className="size-3.5" />
										) : (
											<Copy className="size-3.5" />
										)}
										{copiedId === selected.id
											? "Mensagem copiada"
											: "Copiar mensagem"}
									</button>
								</div>

								{selected.deliveryMode === "free_form" ? (
									<div className="flex items-start gap-3 rounded-xl border border-[#cbeadd] bg-[#edf7f3] p-4">
										<ShieldCheck className="mt-0.5 size-4 shrink-0 text-[#176c4c]" />
										<p className="text-[11px] leading-5 text-[#176c4c]">
											Janela de atendimento aberta. O último inbound válido
											ainda está dentro das 24 horas. A mensagem livre pode ser
											preparada para revisão humana; a Oplera não envia
											automaticamente nesta etapa.
										</p>
									</div>
								) : selected.deliveryMode === "approved_template_required" ? (
									<div className="flex items-start gap-3 rounded-xl border border-[#f0dfae] bg-[#fffaea] p-4">
										<ShieldCheck className="mt-0.5 size-4 shrink-0 text-[#7a5a00]" />
										<p className="text-[11px] leading-5 text-[#765b13]">
											Fora da janela livre de atendimento. O envio pela API
											oficial requer um template aplicável e aprovado conforme a
											política vigente. A Oplera não valida aprovação nem envia
											automaticamente nesta etapa.
										</p>
									</div>
								) : (
									<div className="flex items-start gap-3 rounded-xl border border-[#e6e4dd] bg-[#faf9f5] p-4">
										<CircleAlert className="mt-0.5 size-4 shrink-0 text-[#6f6e67]" />
										<p className="text-[11px] leading-5 text-[#6f6e67]">
											Janela de atendimento em revisão. Não há evidência inbound
											suficiente ou confiável para determinar a janela de 24
											horas. Exige revisão humana antes de qualquer decisão de
											envio.
										</p>
									</div>
								)}

								<button
									type="button"
									onClick={() => queueOpportunity(selected)}
									className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#171815] px-4 py-3 text-xs font-semibold text-white hover:bg-black"
								>
									{queuedIds.includes(selected.id) ? (
										<Check className="size-4" />
									) : (
										<BadgeDollarSign className="size-4" />
									)}
									{queuedIds.includes(selected.id)
										? "Enviada para revisão"
										: "Preparar retomada"}
								</button>
							</div>
						</aside>
					) : null}
				</section>
			</main>
		</div>
	);
}
