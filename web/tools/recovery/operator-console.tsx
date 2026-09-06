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
import { RecoveryComposer } from "../../components/recovery-composer.tsx";
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

const currency = new Intl.NumberFormat("pt-BR", {
	style: "currency",
	currency: "BRL",
	maximumFractionDigits: 0,
});

const dateTime = new Intl.DateTimeFormat("pt-BR", {
	day: "2-digit",
	month: "short",
	hour: "2-digit",
	minute: "2-digit",
});

function statusLabel(status: RecoveryStatus): string {
	return status.replaceAll("_", " ");
}

function StatusBadge({ status }: { status: RecoveryStatus }) {
	const variant =
		status === "recovered"
			? "default"
			: status === "human_review" || status === "handed_off"
				? "secondary"
				: status === "suppressed" || status === "lost"
					? "outline"
					: "token";
	return (
		<Badge variant={variant} className="capitalize">
			{statusLabel(status)}
		</Badge>
	);
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

function Overview({
	snapshot,
	onNavigate,
}: {
	snapshot: OperatorConsoleSnapshot;
	onNavigate: (section: OpleraSection) => void;
}) {
	return (
		<div className="flex flex-col gap-8">
			<section className="flex flex-col items-center gap-5 py-4 text-center sm:py-8">
				<div className="flex max-w-3xl flex-col items-center gap-2">
					<Badge variant="outline">Revenue Recovery Agent</Badge>
					<h1 className="text-balance font-medium text-2xl tracking-tight sm:text-3xl">
						An agent that recovers your pipeline.
					</h1>
					<p className="max-w-xl text-balance text-sm text-muted-foreground">
						Oplera finds revenue already in the commercial pipeline and works to
						recover it.
					</p>
				</div>
				<RecoveryComposer
					onNavigate={(section) => onNavigate(section as OpleraSection)}
				/>
			</section>

			<DashboardSection
				title="Recovery overview"
				description="Current pipeline state from the existing Oplera recovery snapshot."
			>
				<DashboardGrid columns={3}>
					<KpiCard title="Recoverable pipeline">
						<MetricValue
							value={currency.format(snapshot.recovery.recoverableValue)}
							note="Prioritized existing revenue"
						/>
					</KpiCard>
					<KpiCard title="Analyzed">
						<MetricValue
							value={String(snapshot.recovery.opportunitiesAnalyzed)}
						/>
					</KpiCard>
					<KpiCard title="Recoverable">
						<MetricValue value={String(snapshot.recovery.recoverable)} />
					</KpiCard>
					<KpiCard title="Contacted">
						<MetricValue value={String(snapshot.recovery.contacted)} />
					</KpiCard>
					<KpiCard title="Engaged">
						<MetricValue value={String(snapshot.recovery.engaged)} />
					</KpiCard>
					<KpiCard title="Recovered">
						<MetricValue
							value={String(snapshot.recovery.recoveredWon)}
							note={`${snapshot.recovery.handedOff} handed off`}
						/>
					</KpiCard>
				</DashboardGrid>
			</DashboardSection>

			<DashboardRow>
				<ChartCard
					title="Agent focus"
					description="Work selected by the existing planner and ordered by dueAt."
					footer={`${snapshot.agentFocus.length} active focus items`}
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
									<p className="truncate text-sm font-medium capitalize">
										{item.label}
									</p>
									<p className="truncate text-xs text-muted-foreground">
										{item.reason}
									</p>
								</div>
								<span className="shrink-0 text-xs text-muted-foreground">
									{dateTime.format(new Date(item.dueAt))}
								</span>
							</div>
						))}
					</div>
				</ChartCard>
				<ChartCard
					title="Queue"
					description="Durable work state, not a separate workflow system."
				>
					<div className="grid grid-cols-2 border-y">
						{[
							["Due now", snapshot.queue.dueNow],
							["Scheduled", snapshot.queue.scheduled],
							["Processing", snapshot.queue.processing],
							["Awaiting reply", snapshot.queue.awaitingReply],
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

			<DashboardSection title="Recent activity">
				<div className="rounded-lg border bg-card">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Time</TableHead>
								<TableHead>Actor</TableHead>
								<TableHead>Action</TableHead>
								<TableHead>Result</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{snapshot.events
								.slice(-5)
								.reverse()
								.map((item) => (
									<TableRow key={item.id}>
										<TableCell className="text-muted-foreground">
											{dateTime.format(new Date(item.timestamp))}
										</TableCell>
										<TableCell className="capitalize">{item.actor}</TableCell>
										<TableCell className="font-medium capitalize">
											{item.action.replaceAll("_", " ")}
										</TableCell>
										<TableCell className="max-w-[420px] truncate text-muted-foreground">
											{item.result}
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
				title="Recovery Queue"
				description="The existing durable task queue, rendered with the upstream Comp table language."
			/>
			<div className="flex flex-wrap gap-2">
				<select
					aria-label="Filter recovery queue by status"
					value={statusFilter}
					onChange={(event) =>
						setStatusFilter(event.currentTarget.value as RecoveryStatus | "all")
					}
					className="h-8 rounded-md border bg-background px-2.5 text-xs shadow-2xs outline-none focus:ring-2 focus:ring-ring/60"
				>
					<option value="all">All statuses</option>
					{[...new Set(snapshot.opportunities.map((item) => item.status))].map(
						(status) => (
							<option key={status} value={status}>
								{statusLabel(status)}
							</option>
						),
					)}
				</select>
				<select
					aria-label="Filter recovery queue by channel"
					value={channelFilter}
					onChange={(event) =>
						setChannelFilter(
							event.currentTarget.value as "all" | "whatsapp" | "email",
						)
					}
					className="h-8 rounded-md border bg-background px-2.5 text-xs shadow-2xs outline-none focus:ring-2 focus:ring-ring/60"
				>
					<option value="all">All channels</option>
					<option value="whatsapp">WhatsApp</option>
					<option value="email">Email</option>
				</select>
				<Badge variant="outline">{rows.length} tasks</Badge>
			</div>
			<div className="rounded-lg border bg-card">
				<Table className="min-w-[1180px]">
					<TableHeader>
						<TableRow>
							{[
								"Opportunity",
								"Company",
								"Value",
								"Score",
								"Reason",
								"Status",
								"Next action",
								"Due at",
								"Attempt",
								"Assignee",
								"Channel",
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
										{currency.format(opportunity.amount)}
									</TableCell>
									<TableCell>{opportunity.recoveryScore}</TableCell>
									<TableCell className="max-w-[220px] truncate text-muted-foreground">
										{opportunity.reasonCode.replaceAll("_", " ")}
									</TableCell>
									<TableCell>
										<StatusBadge status={opportunity.status} />
									</TableCell>
									<TableCell className="max-w-[260px] truncate text-muted-foreground">
										{opportunity.nextAction}
									</TableCell>
									<TableCell className="text-muted-foreground">
										{dateTime.format(new Date(task.dueAt))}
									</TableCell>
									<TableCell>
										{task.attempt}/{task.maxAttempts}
									</TableCell>
									<TableCell>{opportunity.assignee}</TableCell>
									<TableCell className="capitalize">
										{opportunity.channel}
									</TableCell>
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
					<Badge variant="outline">{currency.format(opportunity.amount)}</Badge>
				</div>
			</CardHeader>
			<CardContent>
				<div className="grid gap-4 text-xs sm:grid-cols-2">
					<div>
						<p className="text-muted-foreground">CRM context</p>
						<p className="mt-1 leading-relaxed">
							{opportunity.pipelineStage} · inactive {opportunity.daysInactive}{" "}
							days · {opportunity.originalReason}
						</p>
					</div>
					<div>
						<p className="text-muted-foreground">Recovery strategy</p>
						<p className="mt-1 leading-relaxed">
							{plan
								? `${plan.strategy.replaceAll("_", " ")} · ${plan.objective}`
								: "No autonomous plan for this state."}
						</p>
					</div>
				</div>
				<div>
					<p className="text-xs text-muted-foreground">
						Why Oplera picked this
					</p>
					<p className="mt-1 text-sm leading-relaxed">
						{opportunity.reasonSummary}
					</p>
				</div>
				<div>
					<p className="text-xs text-muted-foreground">Evidence</p>
					<div className="mt-2 flex flex-col gap-2">
						{opportunity.evidence.map((item) => (
							<div key={item} className="flex gap-2 text-xs">
								<span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
								<span>{item}</span>
							</div>
						))}
					</div>
				</div>
				<div>
					<p className="text-xs text-muted-foreground">Current plan</p>
					<p className="mt-1 text-sm">{opportunity.nextAction}</p>
				</div>
				<div>
					<p className="text-xs text-muted-foreground">Timeline</p>
					<div className="mt-2 divide-y border-y">
						{timeline.length ? (
							timeline.map((item) => (
								<div key={item.id} className="py-2.5">
									<p className="text-xs font-medium capitalize">
										{item.action.replaceAll("_", " ")}
									</p>
									<p className="mt-0.5 text-[10px] text-muted-foreground">
										{dateTime.format(new Date(item.timestamp))} · {item.result}
									</p>
								</div>
							))
						) : (
							<p className="py-3 text-xs text-muted-foreground">
								No demo events yet.
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
				title="Opportunities"
				description="External CRM records mapped into Oplera recovery state. Oplera does not become the CRM."
			/>
			<div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.65fr)]">
				<div className="rounded-lg border bg-card">
					<Table className="min-w-[900px]">
						<TableHeader>
							<TableRow>
								{[
									"CRM ID",
									"Contact",
									"Company",
									"Deal",
									"Stage",
									"Amount",
									"Inactive",
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
									<TableCell>{item.pipelineStage}</TableCell>
									<TableCell className="font-medium">
										{currency.format(item.amount)}
									</TableCell>
									<TableCell>{item.daysInactive}d</TableCell>
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
				title="Conversations"
				description="Recovery-session conversations only. This surface does not introduce a generic omnichannel inbox."
			/>
			<div className="grid min-h-[620px] overflow-hidden rounded-lg border bg-card lg:grid-cols-[280px_1fr]">
				<div className="border-b lg:border-r lg:border-b-0">
					<div className="border-b px-4 py-3 text-xs font-medium text-muted-foreground">
						Recovery sessions
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
								{opportunity?.contactName ?? "Conversation"}
							</h2>
							<p className="mt-1 text-xs text-muted-foreground">
								{opportunity?.channel} · {opportunity?.dealName}
							</p>
						</div>
						<div className="flex gap-2">
							{opportunity ? <StatusBadge status={opportunity.status} /> : null}
							{handoff ? (
								<Badge variant="secondary">human handoff</Badge>
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
										{message.actor}
									</span>
									<span className="text-[9px] text-muted-foreground">
										{dateTime.format(new Date(message.timestamp))}
									</span>
								</div>
								<p className="mt-1.5 text-xs leading-5">{message.text}</p>
							</div>
						))}
					</div>
					{handoff ? (
						<div className="border-t bg-warning/10 px-5 py-3">
							<p className="text-xs font-medium">
								Human handoff · {handoff.reason.replaceAll("_", " ")}
							</p>
							<p className="mt-1 text-xs text-muted-foreground">
								{handoff.recommendedAction}
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
				title="Policies"
				description="The deterministic Policy Engine remains unchanged. This page only ports its visual representation."
			/>
			<DashboardGrid columns={3}>
				<Card>
					<CardHeader>
						<CardTitle>Contact policy</CardTitle>
						<CardDescription>
							When Oplera can contact an opportunity.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<PolicyValue
							label="Max attempts"
							value={String(policy.contact.maxAttempts)}
						/>
						<PolicyValue
							label="Minimum interval"
							value={`${policy.contact.minimumIntervalHours}h`}
						/>
						<PolicyValue
							label="Allowed hours"
							value={`${policy.contact.allowedHours.start}:00–${policy.contact.allowedHours.end}:00`}
						/>
						<PolicyValue label="Weekdays" value="Mon–Fri" />
						<PolicyValue
							label="Opt-out"
							value={policy.contact.suppressOnOptOut ? "suppress" : "disabled"}
						/>
						<PolicyValue
							label="Active human"
							value={
								policy.contact.suppressIfActiveHumanConversation
									? "suppress"
									: "allow"
							}
						/>
					</CardContent>
				</Card>
				<Card>
					<CardHeader>
						<CardTitle>Commercial policy</CardTitle>
						<CardDescription>
							Commercial actions allowed without changing Recovery logic.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<PolicyValue
							label="AI mentions pricing"
							value={
								policy.commercial.aiMayMentionPricing ? "allowed" : "approval"
							}
						/>
						<PolicyValue
							label="Autonomous discount"
							value={`${policy.commercial.maxAutonomousDiscountPercent}% max`}
						/>
						<PolicyValue label="Payment conditions" value="CRM-approved only" />
						<PolicyValue
							label="Custom proposal"
							value={
								policy.commercial.customProposalRequiresHuman
									? "human approval"
									: "allowed"
							}
						/>
					</CardContent>
				</Card>
				<Card>
					<CardHeader>
						<CardTitle>Handoff policy</CardTitle>
						<CardDescription>
							Cases that stop autonomous recovery and move to a human.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<PolicyValue
							label="High intent"
							value={policy.handoff.highIntentToHuman ? "handoff" : "continue"}
						/>
						<PolicyValue
							label="Complaint"
							value={policy.handoff.complaintToHuman ? "handoff" : "continue"}
						/>
						<PolicyValue
							label="Legal / contract"
							value={
								policy.handoff.legalOrContractToHuman ? "handoff" : "continue"
							}
						/>
						<PolicyValue
							label="Unknown customization"
							value={
								policy.handoff.unknownCustomizationToHuman
									? "handoff"
									: "continue"
							}
						/>
						<PolicyValue
							label="Low evidence"
							value={policy.handoff.lowEvidenceToHuman ? "handoff" : "continue"}
						/>
					</CardContent>
				</Card>
			</DashboardGrid>
			<div className="flex gap-3 rounded-lg border bg-muted/40 p-4">
				<ShieldCheck className="mt-0.5 size-4 shrink-0" />
				<div>
					<p className="text-xs font-medium">
						WhatsApp service window remains a policy gate.
					</p>
					<p className="mt-1 max-w-3xl text-xs leading-relaxed text-muted-foreground">
						The existing resolveServiceWindow() logic still determines free-form
						versus approved template behavior. This frontend port changes no
						rule.
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
				title="Activity"
				description="Append-only factual recovery events. Decisions stay short and auditable, with no hidden reasoning exposed."
			/>
			<div className="rounded-lg border bg-card">
				<Table className="min-w-[980px]">
					<TableHeader>
						<TableRow>
							{[
								"Timestamp",
								"Opportunity",
								"Actor",
								"Action",
								"Decision",
								"Policy",
								"Tool",
								"Result",
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
										{dateTime.format(new Date(item.timestamp))}
									</TableCell>
									<TableCell className="font-mono text-[10px]">
										{item.opportunityId ?? "—"}
									</TableCell>
									<TableCell className="capitalize">{item.actor}</TableCell>
									<TableCell className="font-medium capitalize">
										{item.action.replaceAll("_", " ")}
									</TableCell>
									<TableCell className="max-w-[220px] truncate text-muted-foreground">
										{item.decision}
									</TableCell>
									<TableCell>{item.policyResult ?? "—"}</TableCell>
									<TableCell className="font-mono text-[10px]">
										{item.toolInvoked ?? "—"}
									</TableCell>
									<TableCell className="max-w-[280px] truncate text-muted-foreground">
										{item.result}
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
					currency.format(snapshot.recovery.recoverableValue),
					"pipeline",
				],
				[CalendarClock, String(snapshot.queue.dueNow), "due now"],
				[MessagesSquare, String(snapshot.recovery.engaged), "engaged"],
				[UserRoundCheck, String(snapshot.recovery.handedOff), "handed off"],
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
				return <Overview snapshot={snapshot} onNavigate={setPage} />;
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
