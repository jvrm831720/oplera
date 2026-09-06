import {
	CalendarClock,
	CircleDollarSign,
	MessagesSquare,
	ShieldCheck,
	Sparkles,
	UserRoundCheck,
} from "lucide-react";
import { useMemo, useState } from "react";
import type {
	OperatorConsoleSnapshot,
	RecoveryCandidate,
	RecoveryStatus,
} from "../../../api/autonomy/types.ts";
import {
	type OpleraSection,
	OpleraShell,
} from "../../components/oplera-shell.tsx";
import { Badge } from "../../components/ui/badge.tsx";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "../../components/ui/card.tsx";
import {
	ChartCard,
	DashboardGrid,
	DashboardRow,
	DashboardSection,
	KpiCard,
} from "../../components/ui/dashboard.tsx";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "../../components/ui/table.tsx";
import {
	actorLabel,
	brlCurrency,
	channelLabel,
	compactDateTime,
	eventActionLabel,
	integerNumber,
	operationalText,
	policyResultLabel,
	recoveryReasonLabel,
	recoveryStatusLabel,
	strategyLabel,
	taskTypeLabel,
} from "../../lib/pt-br.ts";

function StatusBadge({ status }: { status: RecoveryStatus }) {
	const variant =
		status === "recovered"
			? "default"
			: status === "human_review" || status === "handed_off"
				? "secondary"
				: status === "suppressed" || status === "lost"
					? "outline"
					: "token";
	return <Badge variant={variant}>{recoveryStatusLabel(status)}</Badge>;
}

function PageHeader({
	title,
	description,
}: {
	title: string;
	description: string;
}) {
	return (
		<div className="flex flex-col gap-1">
			<h1 className="font-medium text-2xl tracking-tight">{title}</h1>
			<p className="max-w-3xl text-sm text-muted-foreground">{description}</p>
		</div>
	);
}

function MetricValue({ value, note }: { value: string; note?: string }) {
	return (
		<div>
			<p className="font-medium text-2xl tracking-tight">{value}</p>
			{note ? (
				<p className="mt-1 text-xs text-muted-foreground">{note}</p>
			) : null}
		</div>
	);
}

function Overview({ snapshot }: { snapshot: OperatorConsoleSnapshot }) {
	return (
		<div className="flex flex-col gap-8">
			<section className="flex flex-col items-center gap-4 py-4 text-center sm:py-8">
				<Badge variant="outline">Agente de Receita</Badge>
				<div className="flex max-w-3xl flex-col items-center gap-2">
					<h1 className="text-balance font-medium text-2xl tracking-tight sm:text-3xl">
						Recupere receita que já entrou na operação comercial.
					</h1>
					<p className="max-w-2xl text-balance text-sm text-muted-foreground">
						A Oplera encontra receita que já entrou no pipeline comercial e
						trabalha para recuperá-la. O Agente de Receita é configurado pela
						equipe Oplera e entregue pronto para operar.
					</p>
				</div>
				<div className="max-w-2xl rounded-lg border bg-muted/35 px-4 py-3 text-left text-xs text-muted-foreground">
					O cliente acompanha contexto, decisões, políticas e resultados.
					Configuração de agente, prompts, ferramentas e automações permanecem
					sob gestão da equipe Oplera.
				</div>
			</section>

			<DashboardSection
				title="Visão da recuperação"
				description="Estado atual do pipeline a partir do contexto de recuperação existente da Oplera."
			>
				<DashboardGrid columns={3}>
					<KpiCard title="Pipeline recuperável">
						<MetricValue
							value={brlCurrency.format(snapshot.recovery.recoverableValue)}
							note="Receita existente priorizada"
						/>
					</KpiCard>
					<KpiCard title="Analisadas">
						<MetricValue
							value={integerNumber.format(
								snapshot.recovery.opportunitiesAnalyzed,
							)}
						/>
					</KpiCard>
					<KpiCard title="Recuperáveis">
						<MetricValue
							value={integerNumber.format(snapshot.recovery.recoverable)}
						/>
					</KpiCard>
					<KpiCard title="Contatadas">
						<MetricValue
							value={integerNumber.format(snapshot.recovery.contacted)}
						/>
					</KpiCard>
					<KpiCard title="Em conversa">
						<MetricValue
							value={integerNumber.format(snapshot.recovery.engaged)}
						/>
					</KpiCard>
					<KpiCard title="Recuperadas">
						<MetricValue
							value={integerNumber.format(snapshot.recovery.recoveredWon)}
							note={`${integerNumber.format(snapshot.recovery.handedOff)} encaminhadas`}
						/>
					</KpiCard>
				</DashboardGrid>
			</DashboardSection>

			<DashboardRow>
				<ChartCard
					title="Foco do agente"
					description="Trabalho selecionado pelo Planner existente e ordenado pelo prazo."
					footer={`${snapshot.agentFocus.length} itens ativos`}
				>
					<div className="divide-y border-y">
						{snapshot.agentFocus.map((item) => (
							<div
								key={item.id}
								className="flex items-center gap-3 px-5 py-3 md:px-6"
							>
								<div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted">
									<Sparkles className="size-4 text-muted-foreground" />
								</div>
								<div className="min-w-0 flex-1">
									<p className="truncate text-sm font-medium">
										{operationalText(item.label)}
									</p>
									<p className="truncate text-xs text-muted-foreground">
										{operationalText(item.reason)}
									</p>
								</div>
								<span className="shrink-0 text-xs text-muted-foreground">
									{compactDateTime.format(new Date(item.dueAt))}
								</span>
							</div>
						))}
					</div>
				</ChartCard>
				<ChartCard
					title="Fila"
					description="Estado durável do trabalho, sem criar um sistema paralelo."
				>
					<div className="grid grid-cols-2 border-y">
						{[
							["Para agora", snapshot.queue.dueNow],
							["Agendadas", snapshot.queue.scheduled],
							["Processando", snapshot.queue.processing],
							["Aguardando resposta", snapshot.queue.awaitingReply],
						].map(([label, value], index) => (
							<div
								key={String(label)}
								className={`p-5 ${index % 2 ? "border-l" : ""} ${index > 1 ? "border-t" : ""}`}
							>
								<p className="text-xs text-muted-foreground">{label}</p>
								<p className="mt-1 font-medium text-2xl">{value}</p>
							</div>
						))}
					</div>
				</ChartCard>
			</DashboardRow>

			<DashboardSection title="Atividade recente">
				<div className="rounded-lg border bg-card">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Horário</TableHead>
								<TableHead>Ator</TableHead>
								<TableHead>Ação</TableHead>
								<TableHead>Resultado</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{snapshot.events
								.slice(-5)
								.reverse()
								.map((item) => (
									<TableRow key={item.id}>
										<TableCell className="text-muted-foreground">
											{compactDateTime.format(new Date(item.timestamp))}
										</TableCell>
										<TableCell>{actorLabel(item.actor)}</TableCell>
										<TableCell className="font-medium">
											{eventActionLabel(item.action)}
										</TableCell>
										<TableCell className="max-w-[420px] truncate text-muted-foreground">
											{operationalText(item.result)}
										</TableCell>
									</TableRow>
								))}
						</TableBody>
					</Table>
				</div>
			</DashboardSection>
		</div>
	);
}

function RecoveryQueue({ snapshot }: { snapshot: OperatorConsoleSnapshot }) {
	const [statusFilter, setStatusFilter] = useState<RecoveryStatus | "all">(
		"all",
	);
	const [channelFilter, setChannelFilter] = useState<
		"all" | "whatsapp" | "email"
	>("all");
	const rows = snapshot.tasks
		.map((task) => ({
			task,
			opportunity: snapshot.opportunities.find(
				(item) => item.id === task.opportunityId,
			),
		}))
		.filter(({ opportunity }) =>
			opportunity
				? (statusFilter === "all" || opportunity.status === statusFilter) &&
					(channelFilter === "all" || opportunity.channel === channelFilter)
				: false,
		);

	return (
		<div className="flex flex-col gap-6">
			<PageHeader
				title="Fila de recuperação"
				description="Fila durável existente da Oplera, sem criar um segundo sistema de tarefas."
			/>
			<div className="flex flex-wrap gap-2">
				<select
					aria-label="Filtrar fila de recuperação por status"
					value={statusFilter}
					onChange={(event) =>
						setStatusFilter(event.currentTarget.value as RecoveryStatus | "all")
					}
					className="h-8 rounded-md border bg-background px-2.5 text-xs shadow-2xs outline-none focus:ring-2 focus:ring-ring/60"
				>
					<option value="all">Todos os status</option>
					{[...new Set(snapshot.opportunities.map((item) => item.status))].map(
						(status) => (
							<option key={status} value={status}>
								{recoveryStatusLabel(status)}
							</option>
						),
					)}
				</select>
				<select
					aria-label="Filtrar fila de recuperação por canal"
					value={channelFilter}
					onChange={(event) =>
						setChannelFilter(
							event.currentTarget.value as "all" | "whatsapp" | "email",
						)
					}
					className="h-8 rounded-md border bg-background px-2.5 text-xs shadow-2xs outline-none focus:ring-2 focus:ring-ring/60"
				>
					<option value="all">Todos os canais</option>
					<option value="whatsapp">WhatsApp</option>
					<option value="email">E-mail</option>
				</select>
				<Badge variant="outline">{rows.length} tarefas</Badge>
			</div>
			<div className="rounded-lg border bg-card">
				<Table className="min-w-[1180px]">
					<TableHeader>
						<TableRow>
							{[
								"Oportunidade",
								"Empresa",
								"Valor",
								"Score",
								"Motivo",
								"Status",
								"Próxima ação",
								"Prazo",
								"Tentativa",
								"Responsável",
								"Canal",
							].map((item) => (
								<TableHead key={item}>{item}</TableHead>
							))}
						</TableRow>
					</TableHeader>
					<TableBody>
						{rows.map(({ task, opportunity }) =>
							opportunity ? (
								<TableRow key={task.id}>
									<TableCell className="font-medium">
										{opportunity.contactName}
									</TableCell>
									<TableCell>{opportunity.company}</TableCell>
									<TableCell className="font-medium">
										{brlCurrency.format(opportunity.amount)}
									</TableCell>
									<TableCell>{opportunity.recoveryScore}</TableCell>
									<TableCell className="max-w-[220px] truncate text-muted-foreground">
										{recoveryReasonLabel(opportunity.reasonCode)}
									</TableCell>
									<TableCell>
										<StatusBadge status={opportunity.status} />
									</TableCell>
									<TableCell className="max-w-[260px] truncate text-muted-foreground">
										{operationalText(opportunity.nextAction)}
									</TableCell>
									<TableCell className="text-muted-foreground">
										{compactDateTime.format(new Date(task.dueAt))}
									</TableCell>
									<TableCell>
										{task.attempt}/{task.maxAttempts}
									</TableCell>
									<TableCell>{operationalText(opportunity.assignee)}</TableCell>
									<TableCell>{channelLabel(opportunity.channel)}</TableCell>
								</TableRow>
							) : null,
						)}
					</TableBody>
				</Table>
			</div>
		</div>
	);
}

function OpportunityDetail({
	snapshot,
	opportunity,
}: {
	snapshot: OperatorConsoleSnapshot;
	opportunity: RecoveryCandidate;
}) {
	const plan = snapshot.plans.find(
		(item) => item.candidateId === opportunity.id,
	);
	const timeline = snapshot.events.filter(
		(item) => item.opportunityId === opportunity.id,
	);
	return (
		<Card>
			<CardHeader>
				<CardTitle>{opportunity.dealName}</CardTitle>
				<CardDescription>
					{opportunity.contactName} · {opportunity.company}
				</CardDescription>
				<div className="mt-2 flex flex-wrap gap-2">
					<StatusBadge status={opportunity.status} />
					<Badge variant="mono">score {opportunity.recoveryScore}</Badge>
					<Badge variant="outline">
						{brlCurrency.format(opportunity.amount)}
					</Badge>
				</div>
			</CardHeader>
			<CardContent>
				<div className="grid gap-4 text-xs sm:grid-cols-2">
					<div>
						<p className="text-muted-foreground">Contexto do CRM</p>
						<p className="mt-1 leading-relaxed">
							{operationalText(opportunity.pipelineStage)} ·{" "}
							{opportunity.daysInactive} dias sem atividade ·{" "}
							{operationalText(opportunity.originalReason)}
						</p>
					</div>
					<div>
						<p className="text-muted-foreground">Estratégia de recuperação</p>
						<p className="mt-1 leading-relaxed">
							{plan
								? `${strategyLabel(plan.strategy)} · ${plan.objective}`
								: "Não há plano autônomo para este estado."}
						</p>
					</div>
				</div>
				<div>
					<p className="text-xs text-muted-foreground">
						Por que a Oplera priorizou
					</p>
					<p className="mt-1 text-sm leading-relaxed">
						{opportunity.reasonSummary}
					</p>
				</div>
				<div>
					<p className="text-xs text-muted-foreground">Evidências</p>
					<div className="mt-2 flex flex-col gap-2">
						{opportunity.evidence.map((item) => (
							<div key={item} className="flex gap-2 text-xs">
								<span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
								<span>{operationalText(item)}</span>
							</div>
						))}
					</div>
				</div>
				<div>
					<p className="text-xs text-muted-foreground">Plano atual</p>
					<p className="mt-1 text-sm">
						{operationalText(opportunity.nextAction)}
					</p>
				</div>
				<div>
					<p className="text-xs text-muted-foreground">Linha do tempo</p>
					<div className="mt-2 divide-y border-y">
						{timeline.length ? (
							timeline.map((item) => (
								<div key={item.id} className="py-2.5">
									<p className="text-xs font-medium">
										{eventActionLabel(item.action)}
									</p>
									<p className="mt-0.5 text-[10px] text-muted-foreground">
										{compactDateTime.format(new Date(item.timestamp))} ·{" "}
										{operationalText(item.result)}
									</p>
								</div>
							))
						) : (
							<p className="py-3 text-xs text-muted-foreground">
								Ainda não há eventos na demonstração.
							</p>
						)}
					</div>
				</div>
			</CardContent>
		</Card>
	);
}

function Opportunities({ snapshot }: { snapshot: OperatorConsoleSnapshot }) {
	const [selectedId, setSelectedId] = useState(
		snapshot.opportunities[0]?.id ?? "",
	);
	const selected =
		snapshot.opportunities.find((item) => item.id === selectedId) ??
		snapshot.opportunities[0];
	return (
		<div className="flex flex-col gap-6">
			<PageHeader
				title="Oportunidades"
				description="Registros do CRM externo mapeados para o estado de recuperação da Oplera. A Oplera não se transforma no CRM."
			/>
			<div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.65fr)]">
				<div className="rounded-lg border bg-card">
					<Table className="min-w-[900px]">
						<TableHeader>
							<TableRow>
								{[
									"ID do CRM",
									"Contato",
									"Empresa",
									"Negócio",
									"Etapa",
									"Valor",
									"Sem atividade",
									"Score",
									"Status",
								].map((item) => (
									<TableHead key={item}>{item}</TableHead>
								))}
							</TableRow>
						</TableHeader>
						<TableBody>
							{snapshot.opportunities.map((item) => (
								<TableRow
									key={item.id}
									data-state={selected?.id === item.id ? "selected" : undefined}
									onClick={() => setSelectedId(item.id)}
									className="cursor-pointer"
								>
									<TableCell className="font-mono text-[10px] text-muted-foreground">
										{item.crmId}
									</TableCell>
									<TableCell className="font-medium">
										{item.contactName}
									</TableCell>
									<TableCell>{item.company}</TableCell>
									<TableCell className="max-w-[190px] truncate">
										{item.dealName}
									</TableCell>
									<TableCell>{operationalText(item.pipelineStage)}</TableCell>
									<TableCell className="font-medium">
										{brlCurrency.format(item.amount)}
									</TableCell>
									<TableCell>{item.daysInactive} dias</TableCell>
									<TableCell>{item.recoveryScore}</TableCell>
									<TableCell>
										<StatusBadge status={item.status} />
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</div>
				{selected ? (
					<OpportunityDetail snapshot={snapshot} opportunity={selected} />
				) : null}
			</div>
		</div>
	);
}

function Conversations({ snapshot }: { snapshot: OperatorConsoleSnapshot }) {
	const opportunityIds = [
		...new Set(snapshot.messages.map((item) => item.opportunityId)),
	];
	const [selectedId, setSelectedId] = useState(opportunityIds[0] ?? "");
	const opportunity = snapshot.opportunities.find(
		(item) => item.id === selectedId,
	);
	const messages = snapshot.messages.filter(
		(item) => item.opportunityId === selectedId,
	);
	const handoff = snapshot.handoffs.find(
		(item) => item.opportunityId === selectedId,
	);
	return (
		<div className="flex flex-col gap-6">
			<PageHeader
				title="Conversas"
				description="Somente conversas das sessões de recuperação. Esta superfície não cria uma caixa de entrada omnichannel genérica."
			/>
			<div className="grid min-h-[620px] overflow-hidden rounded-lg border bg-card lg:grid-cols-[280px_1fr]">
				<div className="border-b lg:border-r lg:border-b-0">
					<div className="border-b px-4 py-3 text-xs font-medium text-muted-foreground">
						Sessões de recuperação
					</div>
					{opportunityIds.map((id) => {
						const item = snapshot.opportunities.find(
							(candidate) => candidate.id === id,
						);
						return item ? (
							<button
								type="button"
								key={id}
								onClick={() => setSelectedId(id)}
								className={`block w-full border-b px-4 py-3 text-left transition-colors hover:bg-muted/50 ${selectedId === id ? "bg-muted" : ""}`}
							>
								<p className="text-xs font-medium">{item.contactName}</p>
								<p className="mt-1 truncate text-[10px] text-muted-foreground">
									{item.dealName}
								</p>
								<div className="mt-2">
									<StatusBadge status={item.status} />
								</div>
							</button>
						) : null;
					})}
				</div>
				<div className="flex min-w-0 flex-col">
					<div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
						<div>
							<h2 className="text-sm font-medium">
								{opportunity?.contactName ?? "Conversa"}
							</h2>
							<p className="mt-1 text-xs text-muted-foreground">
								{opportunity ? channelLabel(opportunity.channel) : "—"} ·{" "}
								{opportunity?.dealName}
							</p>
						</div>
						<div className="flex gap-2">
							{opportunity ? <StatusBadge status={opportunity.status} /> : null}
							{handoff ? (
								<Badge variant="secondary">encaminhamento humano</Badge>
							) : null}
						</div>
					</div>
					<div className="flex-1 space-y-3 overflow-y-auto bg-muted/25 p-5">
						{messages.map((message) => (
							<div
								key={message.id}
								className={`max-w-[78%] rounded-lg border px-3 py-2.5 shadow-2xs ${message.actor === "customer" ? "bg-card" : "ml-auto bg-muted"}`}
							>
								<div className="flex items-center justify-between gap-4">
									<span className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
										{actorLabel(message.actor)}
									</span>
									<span className="text-[9px] text-muted-foreground">
										{compactDateTime.format(new Date(message.timestamp))}
									</span>
								</div>
								<p className="mt-1.5 text-xs leading-5">{message.text}</p>
							</div>
						))}
					</div>
					{handoff ? (
						<div className="border-t bg-warning/10 px-5 py-3">
							<p className="text-xs font-medium">
								Encaminhamento humano · {operationalText(handoff.reason)}
							</p>
							<p className="mt-1 text-xs text-muted-foreground">
								{operationalText(handoff.recommendedAction)}
							</p>
						</div>
					) : null}
				</div>
			</div>
		</div>
	);
}

function PolicyValue({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex items-center justify-between gap-4 border-b py-2.5 last:border-b-0">
			<span className="text-xs text-muted-foreground">{label}</span>
			<Badge variant="token">{value}</Badge>
		</div>
	);
}

function Policies({ snapshot }: { snapshot: OperatorConsoleSnapshot }) {
	const policy = snapshot.policy;
	return (
		<div className="flex flex-col gap-6">
			<PageHeader
				title="Políticas"
				description="O Policy Engine determinístico permanece a fonte de verdade. Esta página apenas apresenta suas regras para a operação."
			/>
			<DashboardGrid columns={3}>
				<Card>
					<CardHeader>
						<CardTitle>Política de contato</CardTitle>
						<CardDescription>
							Quando a Oplera pode entrar em contato com uma oportunidade.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<PolicyValue
							label="Máximo de tentativas"
							value={String(policy.contact.maxAttempts)}
						/>
						<PolicyValue
							label="Intervalo mínimo"
							value={`${policy.contact.minimumIntervalHours}h`}
						/>
						<PolicyValue
							label="Horário permitido"
							value={`${policy.contact.allowedHours.start}:00–${policy.contact.allowedHours.end}:00`}
						/>
						<PolicyValue label="Dias permitidos" value="Seg–Sex" />
						<PolicyValue
							label="Opt-out"
							value={
								policy.contact.suppressOnOptOut ? "Suprimir" : "Desativado"
							}
						/>
						<PolicyValue
							label="Conversa humana ativa"
							value={
								policy.contact.suppressIfActiveHumanConversation
									? "Suprimir agente"
									: "Permitir"
							}
						/>
					</CardContent>
				</Card>
				<Card>
					<CardHeader>
						<CardTitle>Política comercial</CardTitle>
						<CardDescription>
							Limites comerciais sem alterar a lógica de recuperação.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<PolicyValue
							label="Mencionar preços"
							value={
								policy.commercial.aiMayMentionPricing
									? "Permitido"
									: "Requer aprovação"
							}
						/>
						<PolicyValue
							label="Desconto autônomo"
							value={`máximo de ${policy.commercial.maxAutonomousDiscountPercent}%`}
						/>
						<PolicyValue
							label="Condições de pagamento"
							value="Somente as aprovadas no CRM"
						/>
						<PolicyValue
							label="Proposta personalizada"
							value={
								policy.commercial.customProposalRequiresHuman
									? "Requer aprovação humana"
									: "Permitido"
							}
						/>
					</CardContent>
				</Card>
				<Card>
					<CardHeader>
						<CardTitle>Política de encaminhamento</CardTitle>
						<CardDescription>
							Casos que interrompem a recuperação autônoma e passam para um
							humano.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<PolicyValue
							label="Alta intenção"
							value={
								policy.handoff.highIntentToHuman ? "Encaminhar" : "Continuar"
							}
						/>
						<PolicyValue
							label="Reclamação"
							value={
								policy.handoff.complaintToHuman ? "Encaminhar" : "Continuar"
							}
						/>
						<PolicyValue
							label="Jurídico / contrato"
							value={
								policy.handoff.legalOrContractToHuman
									? "Encaminhar"
									: "Continuar"
							}
						/>
						<PolicyValue
							label="Customização desconhecida"
							value={
								policy.handoff.unknownCustomizationToHuman
									? "Encaminhar"
									: "Continuar"
							}
						/>
						<PolicyValue
							label="Baixa evidência"
							value={
								policy.handoff.lowEvidenceToHuman ? "Encaminhar" : "Continuar"
							}
						/>
					</CardContent>
				</Card>
			</DashboardGrid>
			<div className="flex gap-3 rounded-lg border bg-muted/40 p-4">
				<ShieldCheck className="mt-0.5 size-4 shrink-0" />
				<div>
					<p className="text-xs font-medium">
						A janela de atendimento do WhatsApp continua sendo uma trava de
						política.
					</p>
					<p className="mt-1 max-w-3xl text-xs leading-relaxed text-muted-foreground">
						A lógica existente de resolveServiceWindow() continua determinando
						mensagem livre, template aprovado ou necessidade de aprovação. A
						V0.5 não cria um segundo cálculo de 24 horas.
					</p>
				</div>
			</div>
		</div>
	);
}

function ActivityPage({ snapshot }: { snapshot: OperatorConsoleSnapshot }) {
	return (
		<div className="flex flex-col gap-6">
			<PageHeader
				title="Atividade"
				description="Eventos factuais e append-only da recuperação. Decisões permanecem curtas e auditáveis, sem expor raciocínio privado."
			/>
			<div className="rounded-lg border bg-card">
				<Table className="min-w-[980px]">
					<TableHeader>
						<TableRow>
							{[
								"Data e hora",
								"Oportunidade",
								"Ator",
								"Ação",
								"Decisão",
								"Política",
								"Ferramenta",
								"Resultado",
							].map((item) => (
								<TableHead key={item}>{item}</TableHead>
							))}
						</TableRow>
					</TableHeader>
					<TableBody>
						{snapshot.events
							.slice()
							.reverse()
							.map((item) => (
								<TableRow key={item.id}>
									<TableCell className="text-muted-foreground">
										{compactDateTime.format(new Date(item.timestamp))}
									</TableCell>
									<TableCell className="font-mono text-[10px]">
										{item.opportunityId ?? "—"}
									</TableCell>
									<TableCell>{actorLabel(item.actor)}</TableCell>
									<TableCell className="font-medium">
										{eventActionLabel(item.action)}
									</TableCell>
									<TableCell className="max-w-[220px] truncate text-muted-foreground">
										{operationalText(item.decision)}
									</TableCell>
									<TableCell>
										{item.policyResult
											? policyResultLabel(item.policyResult)
											: "—"}
									</TableCell>
									<TableCell className="font-mono text-[10px]">
										{item.toolInvoked ?? "—"}
									</TableCell>
									<TableCell className="max-w-[280px] truncate text-muted-foreground">
										{operationalText(item.result)}
									</TableCell>
								</TableRow>
							))}
					</TableBody>
				</Table>
			</div>
		</div>
	);
}

function SectionSummary({ snapshot }: { snapshot: OperatorConsoleSnapshot }) {
	return (
		<div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
			{[
				[
					CircleDollarSign,
					brlCurrency.format(snapshot.recovery.recoverableValue),
					"pipeline",
				],
				[CalendarClock, String(snapshot.queue.dueNow), "para agora"],
				[MessagesSquare, String(snapshot.recovery.engaged), "em conversa"],
				[UserRoundCheck, String(snapshot.recovery.handedOff), "encaminhadas"],
			].map(([Icon, value, label]) => {
				const MetricIcon = Icon as React.ComponentType<{ className?: string }>;
				return (
					<div
						key={String(label)}
						className="flex items-center gap-2 rounded-md border bg-card px-3 py-2 shadow-2xs"
					>
						<MetricIcon className="size-3.5 text-muted-foreground" />
						<div>
							<p className="text-xs font-medium">{String(value)}</p>
							<p className="text-[9px] text-muted-foreground">
								{String(label)}
							</p>
						</div>
					</div>
				);
			})}
		</div>
	);
}

export default function OperatorConsole({
	snapshot,
}: {
	snapshot: OperatorConsoleSnapshot;
}) {
	const [page, setPage] = useState<OpleraSection>("overview");
	const pageContent = useMemo(() => {
		switch (page) {
			case "overview":
				return <Overview snapshot={snapshot} />;
			case "queue":
				return <RecoveryQueue snapshot={snapshot} />;
			case "opportunities":
				return <Opportunities snapshot={snapshot} />;
			case "conversations":
				return <Conversations snapshot={snapshot} />;
			case "policies":
				return <Policies snapshot={snapshot} />;
			case "activity":
				return <ActivityPage snapshot={snapshot} />;
		}
	}, [page, snapshot]);

	return (
		<OpleraShell
			page={page}
			onNavigate={setPage}
			companyName={snapshot.companyName}
			version={snapshot.version}
			generatedAt={snapshot.generatedAt}
			agentStatus={snapshot.agentStatus}
		>
			<main className="min-h-[calc(100dvh-48px)] overflow-y-auto px-4 py-6 sm:px-6 md:px-8 md:py-8">
				<div className="mx-auto flex w-full max-w-[1120px] flex-col gap-6">
					{page !== "overview" ? <SectionSummary snapshot={snapshot} /> : null}
					{pageContent}
				</div>
			</main>
		</OpleraShell>
	);
}
