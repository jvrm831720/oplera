import {
	Activity,
	Bot,
	CheckCircle2,
	Inbox,
	MessagesSquare,
	ShieldCheck,
	Target,
	UserRoundCheck,
} from "lucide-react";
import { useMemo, useState } from "react";
import type {
	OperatorConsoleSnapshot,
	RecoveryCandidate,
	RecoveryStatus,
} from "../../../api/autonomy/types.ts";

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

type Page =
	| "overview"
	| "queue"
	| "opportunities"
	| "conversations"
	| "policies"
	| "activity";

const navigation: Array<{
	id: Page;
	label: string;
	icon: React.ComponentType<{ className?: string }>;
}> = [
	{ id: "overview", label: "Overview", icon: Target },
	{ id: "queue", label: "Recovery Queue", icon: Inbox },
	{ id: "opportunities", label: "Opportunities", icon: UserRoundCheck },
	{ id: "conversations", label: "Conversations", icon: MessagesSquare },
	{ id: "policies", label: "Policies", icon: ShieldCheck },
	{ id: "activity", label: "Activity", icon: Activity },
];

function statusLabel(status: RecoveryStatus): string {
	return status.replaceAll("_", " ");
}

function StatusPill({ status }: { status: RecoveryStatus }) {
	const classes =
		status === "recovered"
			? "border-emerald-200 bg-emerald-50 text-emerald-700"
			: status === "human_review" || status === "handed_off"
				? "border-amber-200 bg-amber-50 text-amber-700"
				: status === "suppressed" || status === "lost"
					? "border-slate-200 bg-slate-50 text-slate-500"
					: "border-[#d9e9d7] bg-[#f3f8f1] text-[#315c36]";
	return (
		<span className={`inline-flex rounded-sm border px-2 py-0.5 text-[10px] font-medium capitalize ${classes}`}>
			{statusLabel(status)}
		</span>
	);
}

function PageTitle({ title, description }: { title: string; description: string }) {
	return (
		<div className="mb-5">
			<h1 className="text-xl font-semibold tracking-[-0.02em] text-[#171a17]">{title}</h1>
			<p className="mt-1 text-xs leading-5 text-[#6f746f]">{description}</p>
		</div>
	);
}

function Metric({ label, value, note }: { label: string; value: string; note?: string }) {
	return (
		<div className="border-r border-[#e7e9e5] px-4 py-3 last:border-r-0">
			<p className="text-[10px] font-medium uppercase tracking-[0.08em] text-[#858a84]">{label}</p>
			<p className="mt-1 text-xl font-semibold tracking-[-0.03em] text-[#171a17]">{value}</p>
			{note ? <p className="mt-0.5 text-[10px] text-[#8c918b]">{note}</p> : null}
		</div>
	);
}

function Overview({ snapshot }: { snapshot: OperatorConsoleSnapshot }) {
	return (
		<>
			<PageTitle
				title="Overview"
				description="O que o agente está recuperando, o que está bloqueado e qual trabalho vem a seguir."
			/>
			<section className="overflow-hidden rounded-md border border-[#e1e4df] bg-white">
				<div className="flex flex-col justify-between gap-3 border-b border-[#e7e9e5] px-5 py-4 md:flex-row md:items-end">
					<div>
						<p className="text-[10px] font-medium uppercase tracking-[0.09em] text-[#7e847d]">Recoverable pipeline</p>
						<p className="mt-1 text-3xl font-semibold tracking-[-0.04em] text-[#171a17]">
							{currency.format(snapshot.recovery.recoverableValue)}
						</p>
						<p className="mt-1 text-xs text-[#777c76]">Receita já existente no pipeline, priorizada para recovery.</p>
					</div>
					<div className="inline-flex items-center gap-2 rounded-sm border border-[#dce8da] bg-[#f5faf3] px-3 py-2 text-xs text-[#315c36]">
						<span className="size-1.5 rounded-full bg-[#74a95e]" />
						Agent running server-side
					</div>
				</div>
				<div className="grid grid-cols-2 md:grid-cols-4">
					<Metric label="Analyzed" value={String(snapshot.recovery.opportunitiesAnalyzed)} />
					<Metric label="Recoverable" value={String(snapshot.recovery.recoverable)} />
					<Metric label="Human review" value={String(snapshot.queue.humanReview)} />
					<Metric label="Recovered" value={currency.format(snapshot.recovery.recoveredValue)} />
				</div>
			</section>

			<div className="mt-5 grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
				<section className="rounded-md border border-[#e1e4df] bg-white">
					<div className="border-b border-[#e7e9e5] px-4 py-3">
						<h2 className="text-sm font-semibold">Agent Focus</h2>
						<p className="mt-0.5 text-[11px] text-[#7d827c]">Próximas tarefas decididas pelo planner e registradas com dueAt.</p>
					</div>
					<div className="divide-y divide-[#edf0eb]">
						{snapshot.agentFocus.map((item) => (
							<div key={item.id} className="grid gap-1 px-4 py-3 md:grid-cols-[1fr_auto] md:items-center">
								<div>
									<p className="text-xs font-medium capitalize text-[#20231f]">{item.label}</p>
									<p className="mt-0.5 text-[11px] text-[#7b807a]">{item.reason}</p>
								</div>
								<span className="text-[10px] text-[#8c918b]">{dateTime.format(new Date(item.dueAt))}</span>
							</div>
						))}
					</div>
				</section>
				<section className="rounded-md border border-[#e1e4df] bg-white">
					<div className="border-b border-[#e7e9e5] px-4 py-3">
						<h2 className="text-sm font-semibold">Queue</h2>
					</div>
					<div className="grid grid-cols-2 gap-px bg-[#edf0eb]">
						{[
							["Due now", snapshot.queue.dueNow],
							["Scheduled", snapshot.queue.scheduled],
							["Processing", snapshot.queue.processing],
							["Awaiting reply", snapshot.queue.awaitingReply],
						].map(([label, value]) => (
							<div key={String(label)} className="bg-white p-4">
								<p className="text-[10px] uppercase tracking-[0.07em] text-[#858a84]">{label}</p>
								<p className="mt-1 text-2xl font-semibold">{value}</p>
							</div>
						))}
					</div>
				</section>
			</div>

			<section className="mt-5 rounded-md border border-[#e1e4df] bg-white">
				<div className="border-b border-[#e7e9e5] px-4 py-3"><h2 className="text-sm font-semibold">Recent activity</h2></div>
				<div className="divide-y divide-[#edf0eb]">
					{snapshot.events.slice(-5).reverse().map((item) => (
						<div key={item.id} className="grid gap-2 px-4 py-3 md:grid-cols-[120px_130px_1fr] md:items-center">
							<span className="text-[10px] text-[#878c86]">{dateTime.format(new Date(item.timestamp))}</span>
							<span className="text-[10px] font-medium uppercase tracking-[0.06em] text-[#59605a]">{item.actor}</span>
							<div><p className="text-xs font-medium">{item.action.replaceAll("_", " ")}</p><p className="mt-0.5 text-[11px] text-[#7d827c]">{item.result}</p></div>
						</div>
					))}
				</div>
			</section>
		</>
	);
}

function RecoveryQueue({ snapshot }: { snapshot: OperatorConsoleSnapshot }) {
	const rows = snapshot.tasks.map((task) => ({
		task,
		opportunity: snapshot.opportunities.find((item) => item.id === task.opportunityId),
	}));
	return (
		<>
			<PageTitle title="Recovery Queue" description="Work queue do agente. dueAt e prioridade decidem o que pode ser leased por cada dispatcher." />
			<div className="overflow-x-auto rounded-md border border-[#e1e4df] bg-white">
				<table className="w-full min-w-[1180px] text-left">
					<thead className="border-b border-[#e7e9e5] bg-[#fafbf9] text-[10px] uppercase tracking-[0.06em] text-[#7c827b]">
						<tr>{["Opportunity", "Company", "Value", "Score", "Reason", "Status", "Next action", "Due at", "Attempt", "Assignee", "Channel"].map((item) => <th key={item} className="px-3 py-2.5 font-medium">{item}</th>)}</tr>
					</thead>
					<tbody className="divide-y divide-[#edf0eb]">
						{rows.map(({ task, opportunity }) => opportunity ? (
							<tr key={task.id} className="text-xs hover:bg-[#fbfcfa]">
								<td className="px-3 py-3 font-medium">{opportunity.contactName}</td>
								<td className="px-3 py-3 text-[#666c66]">{opportunity.company}</td>
								<td className="px-3 py-3 font-medium">{currency.format(opportunity.amount)}</td>
								<td className="px-3 py-3">{opportunity.recoveryScore}</td>
								<td className="max-w-[220px] px-3 py-3 text-[#666c66]">{opportunity.reasonCode.replaceAll("_", " ")}</td>
								<td className="px-3 py-3"><StatusPill status={opportunity.status} /></td>
								<td className="max-w-[250px] px-3 py-3 text-[#555b55]">{opportunity.nextAction}</td>
								<td className="px-3 py-3 text-[#777d77]">{dateTime.format(new Date(task.dueAt))}</td>
								<td className="px-3 py-3">{task.attempt}/{task.maxAttempts}</td>
								<td className="px-3 py-3">{opportunity.assignee}</td>
								<td className="px-3 py-3 capitalize">{opportunity.channel}</td>
							</tr>
						) : null)}
					</tbody>
				</table>
			</div>
		</>
	);
}

function OpportunityDetail({ snapshot, opportunity }: { snapshot: OperatorConsoleSnapshot; opportunity: RecoveryCandidate }) {
	const plan = snapshot.plans.find((item) => item.candidateId === opportunity.id);
	const timeline = snapshot.events.filter((item) => item.opportunityId === opportunity.id);
	return (
		<div className="rounded-md border border-[#e1e4df] bg-white">
			<div className="border-b border-[#e7e9e5] p-4">
				<div className="flex items-start justify-between gap-3"><div><p className="text-[10px] uppercase tracking-[0.08em] text-[#868b85]">{opportunity.crmId}</p><h2 className="mt-1 text-base font-semibold">{opportunity.dealName}</h2><p className="mt-1 text-xs text-[#757a74]">{opportunity.contactName} · {opportunity.company}</p></div><div className="text-right"><p className="text-base font-semibold">{currency.format(opportunity.amount)}</p><p className="text-[10px] text-[#7e847d]">Recovery score {opportunity.recoveryScore}/100</p></div></div>
			</div>
			<div className="space-y-5 p-4 text-xs">
				<div><h3 className="font-semibold">CRM Context</h3><p className="mt-1 leading-5 text-[#687068]">Stage: {opportunity.pipelineStage}. Inactive: {opportunity.daysInactive} days. Original state: {opportunity.originalReason}.</p></div>
				<div><h3 className="font-semibold">Why Oplera picked this</h3><p className="mt-1 leading-5 text-[#687068]">{opportunity.reasonSummary}</p></div>
				<div><h3 className="font-semibold">Recovery Strategy</h3><p className="mt-1 leading-5 text-[#687068]">{plan ? `${plan.strategy.replaceAll("_", " ")} · ${plan.objective}` : "No autonomous plan while this record is suppressed or closed."}</p></div>
				<div><h3 className="font-semibold">Evidence</h3><ul className="mt-2 space-y-1 text-[#687068]">{opportunity.evidence.map((item) => <li key={item} className="flex gap-2"><span className="mt-1.5 size-1 shrink-0 rounded-full bg-[#71935f]" />{item}</li>)}</ul></div>
				<div><h3 className="font-semibold">Current plan</h3><p className="mt-1 leading-5 text-[#687068]">{opportunity.nextAction}</p></div>
				<div><h3 className="font-semibold">Timeline</h3><div className="mt-2 space-y-2">{timeline.length ? timeline.map((item) => <div key={item.id} className="border-l border-[#dfe4dc] pl-3"><p className="font-medium capitalize">{item.action.replaceAll("_", " ")}</p><p className="mt-0.5 text-[10px] text-[#858b84]">{dateTime.format(new Date(item.timestamp))} · {item.result}</p></div>) : <p className="text-[#858b84]">No demo events yet.</p>}</div></div>
			</div>
		</div>
	);
}

function Opportunities({ snapshot }: { snapshot: OperatorConsoleSnapshot }) {
	const [selectedId, setSelectedId] = useState(snapshot.opportunities[0]?.id ?? "");
	const selected = snapshot.opportunities.find((item) => item.id === selectedId) ?? snapshot.opportunities[0];
	return (
		<>
			<PageTitle title="Opportunities" description="Oportunidades externas mapeadas para estado de recovery. A Oplera não replica o CRM." />
			<div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.65fr)]">
				<div className="overflow-x-auto rounded-md border border-[#e1e4df] bg-white">
					<table className="w-full min-w-[900px] text-left"><thead className="border-b border-[#e7e9e5] bg-[#fafbf9] text-[10px] uppercase tracking-[0.06em] text-[#7c827b]"><tr>{["CRM ID", "Contact", "Company", "Deal", "Stage", "Amount", "Inactive", "Score", "Status", "Next action"].map((item) => <th key={item} className="px-3 py-2.5 font-medium">{item}</th>)}</tr></thead><tbody className="divide-y divide-[#edf0eb]">{snapshot.opportunities.map((item) => <tr key={item.id} onClick={() => setSelectedId(item.id)} className={`cursor-pointer text-xs hover:bg-[#fbfcfa] ${selected?.id === item.id ? "bg-[#f7faf5]" : ""}`}><td className="px-3 py-3 text-[#737973]">{item.crmId}</td><td className="px-3 py-3 font-medium">{item.contactName}</td><td className="px-3 py-3">{item.company}</td><td className="max-w-[180px] px-3 py-3">{item.dealName}</td><td className="px-3 py-3 text-[#6c726c]">{item.pipelineStage}</td><td className="px-3 py-3 font-medium">{currency.format(item.amount)}</td><td className="px-3 py-3">{item.daysInactive}d</td><td className="px-3 py-3">{item.recoveryScore}</td><td className="px-3 py-3"><StatusPill status={item.status} /></td><td className="max-w-[230px] px-3 py-3 text-[#666c66]">{item.nextAction}</td></tr>)}</tbody></table>
				</div>
				{selected ? <OpportunityDetail snapshot={snapshot} opportunity={selected} /> : null}
			</div>
		</>
	);
}

function Conversations({ snapshot }: { snapshot: OperatorConsoleSnapshot }) {
	const opportunityIds = [...new Set(snapshot.messages.map((item) => item.opportunityId))];
	const [selectedId, setSelectedId] = useState(opportunityIds[0] ?? "");
	const opportunity = snapshot.opportunities.find((item) => item.id === selectedId);
	const messages = snapshot.messages.filter((item) => item.opportunityId === selectedId);
	const handoff = snapshot.handoffs.find((item) => item.opportunityId === selectedId);
	return (
		<>
			<PageTitle title="Conversations" description="Somente conversas pertencentes a recovery sessions. Não é uma inbox omnichannel." />
			<div className="grid min-h-[620px] overflow-hidden rounded-md border border-[#e1e4df] bg-white lg:grid-cols-[280px_1fr]">
				<div className="border-r border-[#e7e9e5]"><div className="border-b border-[#e7e9e5] px-4 py-3 text-xs font-semibold">Recovery sessions</div>{opportunityIds.map((id) => { const item = snapshot.opportunities.find((candidate) => candidate.id === id); return item ? <button type="button" key={id} onClick={() => setSelectedId(id)} className={`block w-full border-b border-[#edf0eb] px-4 py-3 text-left ${selectedId === id ? "bg-[#f7faf5]" : "hover:bg-[#fbfcfa]"}`}><p className="text-xs font-medium">{item.contactName}</p><p className="mt-1 text-[10px] text-[#7b817a]">{item.dealName}</p><div className="mt-2"><StatusPill status={item.status} /></div></button> : null; })}</div>
				<div className="flex min-w-0 flex-col">
					<div className="border-b border-[#e7e9e5] px-5 py-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-sm font-semibold">{opportunity?.contactName ?? "Conversation"}</h2><p className="mt-1 text-[10px] text-[#7b817a]">{opportunity?.channel} · {opportunity?.dealName}</p></div><div className="grid grid-cols-3 gap-4 text-right text-[10px]"><div><p className="text-[#8b908a]">Intent</p><p className="mt-0.5 font-medium text-[#444a44]">{opportunity?.status === "engaged" ? "engaged" : opportunity?.reasonCode.replaceAll("_", " ")}</p></div><div><p className="text-[#8b908a]">Objection</p><p className="mt-0.5 font-medium text-[#444a44]">{opportunity?.reasonCode === "budget_objection" ? "budget" : "—"}</p></div><div><p className="text-[#8b908a]">Handoff</p><p className="mt-0.5 font-medium text-[#444a44]">{handoff ? "required" : "none"}</p></div></div></div></div>
					<div className="flex-1 space-y-3 bg-[#fbfcfa] p-5">{messages.map((message) => <div key={message.id} className={`max-w-[72%] rounded-md border px-3 py-2 ${message.actor === "customer" ? "border-[#dde1dc] bg-white" : "ml-auto border-[#dbe9d5] bg-[#f0f7ed]"}`}><div className="flex items-center justify-between gap-4"><span className="text-[9px] font-medium uppercase tracking-[0.08em] text-[#7f857e]">{message.actor}</span><span className="text-[9px] text-[#929791]">{dateTime.format(new Date(message.timestamp))}</span></div><p className="mt-1.5 text-xs leading-5 text-[#353b35]">{message.text}</p></div>)}</div>
					{handoff ? <div className="border-t border-[#e7e9e5] bg-[#fffaf0] px-5 py-3"><p className="text-xs font-semibold text-[#73551a]">Human handoff · {handoff.reason.replaceAll("_", " ")}</p><p className="mt-1 text-[11px] text-[#7d6a42]">{handoff.recommendedAction}</p></div> : null}
				</div>
			</div>
		</>
	);
}

function PolicyRow({ label, value }: { label: string; value: string }) {
	return <div className="flex items-center justify-between gap-4 border-b border-[#edf0eb] py-2.5 last:border-b-0"><span className="text-xs text-[#5f655f]">{label}</span><span className="rounded-sm bg-[#f4f6f2] px-2 py-1 text-[10px] font-medium text-[#3f463f]">{value}</span></div>;
}

function Policies({ snapshot }: { snapshot: OperatorConsoleSnapshot }) {
	const policy = snapshot.policy;
	return (
		<>
			<PageTitle title="Policies" description="A IA propõe. O Policy Engine determinístico decide se a ação pode executar." />
			<div className="grid gap-5 lg:grid-cols-3">
				<section className="rounded-md border border-[#e1e4df] bg-white p-4"><h2 className="text-sm font-semibold">Contact policy</h2><div className="mt-3"><PolicyRow label="Max attempts" value={String(policy.contact.maxAttempts)} /><PolicyRow label="Minimum interval" value={`${policy.contact.minimumIntervalHours}h`} /><PolicyRow label="Allowed hours" value={`${policy.contact.allowedHours.start}:00–${policy.contact.allowedHours.end}:00`} /><PolicyRow label="Weekdays" value="Mon–Fri" /><PolicyRow label="Opt-out" value={policy.contact.suppressOnOptOut ? "suppress" : "disabled"} /><PolicyRow label="Active human" value={policy.contact.suppressIfActiveHumanConversation ? "suppress" : "allow"} /></div></section>
				<section className="rounded-md border border-[#e1e4df] bg-white p-4"><h2 className="text-sm font-semibold">Commercial policy</h2><div className="mt-3"><PolicyRow label="AI mentions pricing" value={policy.commercial.aiMayMentionPricing ? "allowed" : "approval"} /><PolicyRow label="Autonomous discount" value={`${policy.commercial.maxAutonomousDiscountPercent}% max`} /><PolicyRow label="Payment conditions" value="CRM-approved only" /><PolicyRow label="Custom proposal" value={policy.commercial.customProposalRequiresHuman ? "human approval" : "allowed"} /></div></section>
				<section className="rounded-md border border-[#e1e4df] bg-white p-4"><h2 className="text-sm font-semibold">Handoff policy</h2><div className="mt-3"><PolicyRow label="High intent" value={policy.handoff.highIntentToHuman ? "handoff" : "continue"} /><PolicyRow label="Complaint" value={policy.handoff.complaintToHuman ? "handoff" : "continue"} /><PolicyRow label="Legal / contract" value={policy.handoff.legalOrContractToHuman ? "handoff" : "continue"} /><PolicyRow label="Unknown customization" value={policy.handoff.unknownCustomizationToHuman ? "handoff" : "continue"} /><PolicyRow label="Low evidence" value={policy.handoff.lowEvidenceToHuman ? "handoff" : "continue"} /></div></section>
			</div>
			<section className="mt-5 rounded-md border border-[#dce6d8] bg-[#f7faf5] p-4"><div className="flex gap-3"><ShieldCheck className="mt-0.5 size-4 text-[#53754a]" /><div><h2 className="text-xs font-semibold text-[#36533a]">WhatsApp service window is a policy gate</h2><p className="mt-1 max-w-3xl text-[11px] leading-5 text-[#637063]">Antes de qualquer envio WhatsApp, o Policy Engine chama a função existente <code>resolveServiceWindow()</code>. Janela fechada não libera free-form: exige template aprovado suportado pelo provider ou revisão/replanejamento.</p></div></div></section>
		</>
	);
}

function ActivityPage({ snapshot }: { snapshot: OperatorConsoleSnapshot }) {
	return (
		<>
			<PageTitle title="Activity" description="Audit trail append-only. Decisões curtas e evidências, nunca chain-of-thought ou secrets." />
			<div className="overflow-x-auto rounded-md border border-[#e1e4df] bg-white"><table className="w-full min-w-[980px] text-left"><thead className="border-b border-[#e7e9e5] bg-[#fafbf9] text-[10px] uppercase tracking-[0.06em] text-[#7c827b]"><tr>{["Timestamp", "Opportunity", "Actor", "Action", "Decision", "Policy", "Tool", "Result"].map((item) => <th key={item} className="px-3 py-2.5 font-medium">{item}</th>)}</tr></thead><tbody className="divide-y divide-[#edf0eb]">{snapshot.events.slice().reverse().map((item) => <tr key={item.id} className="text-xs"><td className="px-3 py-3 text-[#777d77]">{dateTime.format(new Date(item.timestamp))}</td><td className="px-3 py-3">{item.opportunityId ?? "—"}</td><td className="px-3 py-3 capitalize">{item.actor}</td><td className="px-3 py-3 font-medium">{item.action.replaceAll("_", " ")}</td><td className="px-3 py-3 text-[#656b65]">{item.decision}</td><td className="px-3 py-3">{item.policyResult ?? "—"}</td><td className="px-3 py-3 font-mono text-[10px]">{item.toolInvoked ?? "—"}</td><td className="max-w-[260px] px-3 py-3 text-[#656b65]">{item.result}</td></tr>)}</tbody></table></div>
		</>
	);
}

export default function OperatorConsole({ snapshot }: { snapshot: OperatorConsoleSnapshot }) {
	const [page, setPage] = useState<Page>("overview");
	const pageContent = useMemo(() => {
		switch (page) {
			case "overview": return <Overview snapshot={snapshot} />;
			case "queue": return <RecoveryQueue snapshot={snapshot} />;
			case "opportunities": return <Opportunities snapshot={snapshot} />;
			case "conversations": return <Conversations snapshot={snapshot} />;
			case "policies": return <Policies snapshot={snapshot} />;
			case "activity": return <ActivityPage snapshot={snapshot} />;
		}
	}, [page, snapshot]);

	return (
		<div className="min-h-dvh bg-[#f7f8f6] text-[#171a17] lg:grid lg:grid-cols-[220px_1fr]">
			<aside className="border-b border-[#e1e4df] bg-white lg:min-h-dvh lg:border-b-0 lg:border-r">
				<div className="flex h-14 items-center gap-2.5 border-b border-[#e7e9e5] px-4"><div className="flex size-7 items-center justify-center rounded-sm bg-[#c6ff69] text-xs font-black text-[#172016]">O</div><div><p className="text-xs font-semibold tracking-[0.08em]">OPLERA</p><p className="text-[9px] text-[#858a84]">Revenue Recovery Agent</p></div></div>
				<nav className="flex gap-1 overflow-x-auto p-2 lg:block lg:space-y-1">{navigation.map((item) => { const Icon = item.icon; return <button key={item.id} type="button" onClick={() => setPage(item.id)} className={`flex shrink-0 items-center gap-2 rounded-sm px-3 py-2 text-xs transition-colors lg:w-full ${page === item.id ? "bg-[#f0f3ee] font-medium text-[#273027]" : "text-[#6f756e] hover:bg-[#f7f8f6]"}`}><Icon className="size-3.5" />{item.label}</button>; })}</nav>
				<div className="mx-3 mt-4 hidden rounded-md border border-[#e3e7e1] bg-[#fafbf9] p-3 lg:block"><div className="flex items-center gap-2"><Bot className="size-3.5 text-[#5c7454]" /><p className="text-[10px] font-semibold uppercase tracking-[0.06em]">Agent status</p></div><div className="mt-2 flex items-center gap-2 text-xs"><span className="size-1.5 rounded-full bg-[#70a65d]" />Running</div><p className="mt-2 text-[10px] leading-4 text-[#7d837c]">Closing this console does not stop server-side orchestration.</p></div>
			</aside>
			<div className="min-w-0">
				<header className="flex min-h-14 items-center justify-between gap-4 border-b border-[#e1e4df] bg-white px-4 md:px-6"><div><p className="text-xs font-medium">{snapshot.companyName}</p><p className="text-[9px] text-[#8a8f89]">Autonomous Revenue Recovery Agent · V{snapshot.version}</p></div><div className="flex items-center gap-3 text-[10px] text-[#727872]"><span className="hidden sm:inline">Generated {dateTime.format(new Date(snapshot.generatedAt))}</span><span className="inline-flex items-center gap-1.5 rounded-sm border border-[#e0e5de] bg-[#fafbf9] px-2 py-1"><CheckCircle2 className="size-3 text-[#66835d]" />Demo Mode</span></div></header>
				<main className="p-4 md:p-6 xl:p-7">{pageContent}</main>
			</div>
		</div>
	);
}
