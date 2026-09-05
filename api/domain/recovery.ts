import { z } from "zod";

const messageDirectionSchema = z.enum(["inbound", "outbound"]);

export const conversationMessageSchema = z.object({
	direction: messageDirectionSchema,
	text: z.string().trim().min(1).max(4_000),
	timestamp: z.iso.datetime(),
});

export type ConversationMessage = z.infer<typeof conversationMessageSchema>;

export const conversationSchema = z.object({
	id: z.string().trim().min(1).max(120),
	contactName: z.string().trim().min(1).max(160),
	phone: z.string().trim().max(40).optional(),
	source: z.string().trim().max(80).optional(),
	owner: z.string().trim().max(120).optional(),
	estimatedValue: z.number().nonnegative().max(100_000_000).optional(),
	messages: z.array(conversationMessageSchema).min(1).max(500),
});

export type Conversation = z.infer<typeof conversationSchema>;

const prioritySchema = z.enum(["high", "medium", "low"]);
const deliveryModeSchema = z.enum([
	"free_form",
	"approved_template_required",
	"manual_review",
]);

export const recoveryOpportunitySchema = z.object({
	id: z.string(),
	contactName: z.string(),
	phone: z.string().optional(),
	source: z.string(),
	owner: z.string(),
	estimatedValue: z.number(),
	score: z.number().int().min(0).max(100),
	priority: prioritySchema,
	reason: z.string(),
	lastMessage: z.string(),
	lastMessageDirection: messageDirectionSchema,
	lastMessageAt: z.string(),
	lastInboundMessageAt: z.string().optional(),
	serviceWindowExpiresAt: z.string().optional(),
	serviceWindowOpen: z.boolean().nullable(),
	inactivityDays: z.number().int().nonnegative(),
	intentSignals: z.array(z.string()),
	suggestedAction: z.string(),
	suggestedMessage: z.string(),
	deliveryMode: deliveryModeSchema,
	conversation: z.array(conversationMessageSchema),
});

export type RecoveryOpportunity = z.infer<typeof recoveryOpportunitySchema>;

export const recoveryAnalysisSchema = z.object({
	companyName: z.string(),
	generatedAt: z.string(),
	isSample: z.boolean(),
	summary: z.object({
		totalConversations: z.number().int().nonnegative(),
		recoverableCount: z.number().int().nonnegative(),
		highPriorityCount: z.number().int().nonnegative(),
		estimatedPipeline: z.number().nonnegative(),
		needsTemplateCount: z.number().int().nonnegative(),
	}),
	opportunities: z.array(recoveryOpportunitySchema),
});

export type RecoveryAnalysis = z.infer<typeof recoveryAnalysisSchema>;

const INTENT_PATTERNS = [
	{
		label: "preço",
		pattern: /pre[cç]o|valor|quanto (custa|fica)/i,
		points: 16,
	},
	{
		label: "proposta",
		pattern: /proposta|or[cç]amento|condi[cç][aã]o/i,
		points: 18,
	},
	{ label: "pagamento", pattern: /pix|cart[aã]o|boleto|parcel/i, points: 20 },
	{
		label: "prazo",
		pattern: /quando|prazo|entrega|come[cç]ar|agenda/i,
		points: 13,
	},
	{
		label: "decisão",
		pattern: /fechar|contratar|quero|vamos|pode ser/i,
		points: 22,
	},
] as const;

const LOSS_PATTERN =
	/n[aã]o (quero|tenho interesse)|desisti|j[aá] fechei|pare de|cancel/i;
const WON_PATTERN =
	/pagamento (feito|realizado)|pix (feito|enviado)|contrato assinado|fechado/i;
const SERVICE_WINDOW_MS = 24 * 60 * 60 * 1_000;

export function resolveServiceWindow(
	messages: ConversationMessage[],
	referenceDate: Date,
): Pick<
	RecoveryOpportunity,
	| "lastInboundMessageAt"
	| "serviceWindowExpiresAt"
	| "serviceWindowOpen"
	| "deliveryMode"
> {
	const lastInbound = [...messages]
		.filter((message) => message.direction === "inbound")
		.sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp))
		.at(-1);

	if (!lastInbound) {
		return {
			serviceWindowOpen: null,
			deliveryMode: "manual_review",
		};
	}

	const lastInboundAt = Date.parse(lastInbound.timestamp);
	const referenceTime = referenceDate.getTime();
	if (
		Number.isNaN(lastInboundAt) ||
		Number.isNaN(referenceTime) ||
		lastInboundAt > referenceTime
	) {
		return {
			lastInboundMessageAt: lastInbound.timestamp,
			serviceWindowOpen: null,
			deliveryMode: "manual_review",
		};
	}

	const serviceWindowExpiresAt = new Date(
		lastInboundAt + SERVICE_WINDOW_MS,
	).toISOString();
	const serviceWindowOpen = referenceTime - lastInboundAt <= SERVICE_WINDOW_MS;

	return {
		lastInboundMessageAt: lastInbound.timestamp,
		serviceWindowExpiresAt,
		serviceWindowOpen,
		deliveryMode: serviceWindowOpen
			? "free_form"
			: "approved_template_required",
	};
}

function startOfDay(date: Date): number {
	return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function daysBetween(later: Date, earlier: Date): number {
	return Math.max(
		0,
		Math.floor((startOfDay(later) - startOfDay(earlier)) / 86_400_000),
	);
}

function money(value: number): string {
	return new Intl.NumberFormat("pt-BR", {
		style: "currency",
		currency: "BRL",
		maximumFractionDigits: 0,
	}).format(value);
}

function firstName(name: string): string {
	return name.trim().split(/\s+/)[0] ?? name;
}

function suggestedMessageFor(opportunity: {
	contactName: string;
	intentSignals: string[];
	estimatedValue: number;
}): string {
	const name = firstName(opportunity.contactName);
	if (opportunity.intentSignals.includes("pagamento")) {
		return `Oi, ${name}! Vi que nossa conversa ficou pendente justamente nas condições de pagamento. Posso retomar de onde paramos e verificar a melhor opção para você?`;
	}
	if (opportunity.intentSignals.includes("proposta")) {
		return `Oi, ${name}! Retomei nossa conversa e percebi que a proposta ficou sem um próximo passo. Ainda faz sentido avaliarmos isso juntos? Se quiser, reviso as condições com você.`;
	}
	if (opportunity.estimatedValue > 0) {
		return `Oi, ${name}! Nossa conversa ficou sem conclusão e eu não queria deixar sua solicitação perdida. O projeto ainda é uma prioridade para você? Posso retomar exatamente do ponto em que paramos.`;
	}
	return `Oi, ${name}! Vi que nossa conversa acabou ficando sem um próximo passo. Isso ainda faz sentido para você? Posso retomar de onde paramos.`;
}

function analyzeConversation(
	conversation: Conversation,
	averageTicket: number,
	referenceDate: Date,
): RecoveryOpportunity | null {
	const messages = [...conversation.messages].sort(
		(a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp),
	);
	const last = messages.at(-1);
	if (!last) return null;

	const customerText = messages
		.filter((message) => message.direction === "inbound")
		.map((message) => message.text)
		.join(" ");
	if (
		!customerText ||
		LOSS_PATTERN.test(customerText) ||
		WON_PATTERN.test(customerText)
	) {
		return null;
	}

	const inactivityDays = daysBetween(referenceDate, new Date(last.timestamp));
	if (inactivityDays < 1 || inactivityDays > 120) return null;

	const intentSignals: string[] = [];
	let score = 12;
	for (const signal of INTENT_PATTERNS) {
		if (signal.pattern.test(customerText)) {
			intentSignals.push(signal.label);
			score += signal.points;
		}
	}

	if (last.direction === "inbound") score += 24;
	if (inactivityDays <= 14) score += 15;
	else if (inactivityDays <= 30) score += 10;
	else if (inactivityDays <= 60) score += 5;

	const estimatedValue = conversation.estimatedValue ?? averageTicket;
	if (estimatedValue >= averageTicket * 1.5) score += 8;
	if (intentSignals.length === 0) score -= 18;
	score = Math.max(0, Math.min(100, score));
	if (score < 35) return null;

	const priority = score >= 75 ? "high" : score >= 55 ? "medium" : "low";
	const serviceWindow = resolveServiceWindow(messages, referenceDate);
	const unanswered = last.direction === "inbound";
	const reason = unanswered
		? `Cliente demonstrou ${intentSignals.join(", ") || "interesse"} e ficou sem resposta.`
		: `Negociação com ${intentSignals.join(", ") || "sinais comerciais"} está parada há ${inactivityDays} dias.`;

	const opportunityBase = {
		contactName: conversation.contactName,
		intentSignals,
		estimatedValue,
	};

	return {
		id: conversation.id,
		contactName: conversation.contactName,
		phone: conversation.phone,
		source: conversation.source ?? "WhatsApp",
		owner: conversation.owner ?? "Não atribuído",
		estimatedValue,
		score,
		priority,
		reason,
		lastMessage: last.text,
		lastMessageDirection: last.direction,
		lastMessageAt: last.timestamp,
		...serviceWindow,
		inactivityDays,
		intentSignals,
		suggestedAction:
			priority === "high"
				? "Revisar e retomar hoje"
				: "Adicionar à fila de recuperação",
		suggestedMessage: suggestedMessageFor(opportunityBase),
		conversation: messages.slice(-8),
	};
}

export function analyzeRecoveryPipeline(input: {
	companyName?: string;
	averageTicket?: number;
	conversations: Conversation[];
	referenceDate?: string;
	isSample?: boolean;
}): RecoveryAnalysis {
	const averageTicket = input.averageTicket ?? 2_500;
	const referenceDate = input.referenceDate
		? new Date(input.referenceDate)
		: new Date();
	if (Number.isNaN(referenceDate.getTime())) {
		throw new Error("referenceDate must be a valid ISO date");
	}

	const opportunities = input.conversations
		.map((conversation) =>
			analyzeConversation(conversation, averageTicket, referenceDate),
		)
		.filter((item): item is RecoveryOpportunity => item !== null)
		.sort((a, b) => b.score - a.score || b.estimatedValue - a.estimatedValue);

	return {
		companyName: input.companyName?.trim() || "Operação comercial",
		generatedAt: referenceDate.toISOString(),
		isSample: input.isSample ?? false,
		summary: {
			totalConversations: input.conversations.length,
			recoverableCount: opportunities.length,
			highPriorityCount: opportunities.filter(
				(opportunity) => opportunity.priority === "high",
			).length,
			estimatedPipeline: opportunities.reduce(
				(total, opportunity) => total + opportunity.estimatedValue,
				0,
			),
			needsTemplateCount: opportunities.filter(
				(opportunity) =>
					opportunity.deliveryMode === "approved_template_required",
			).length,
		},
		opportunities,
	};
}

function daysAgo(reference: Date, days: number, hour: number): string {
	const date = new Date(reference);
	date.setUTCDate(date.getUTCDate() - days);
	date.setUTCHours(hour, 0, 0, 0);
	return date.toISOString();
}

export function sampleConversations(
	referenceDate = new Date(),
): Conversation[] {
	return [
		{
			id: "opp-mariana",
			contactName: "Mariana Costa",
			phone: "5521999991001",
			source: "Meta Ads",
			owner: "Rafael",
			estimatedValue: 5_800,
			messages: [
				{
					direction: "inbound",
					text: "Olá, queria entender o valor do plano para minha clínica.",
					timestamp: daysAgo(referenceDate, 9, 13),
				},
				{
					direction: "outbound",
					text: "Claro! Para sua operação, a proposta fica em R$ 5.800.",
					timestamp: daysAgo(referenceDate, 9, 14),
				},
				{
					direction: "inbound",
					text: "Consigo parcelar? Se der, quero começar ainda este mês.",
					timestamp: daysAgo(referenceDate, 8, 16),
				},
			],
		},
		{
			id: "opp-lucas",
			contactName: "Lucas Almeida",
			phone: "5521999991002",
			source: "Indicação",
			owner: "Camila",
			estimatedValue: 3_200,
			messages: [
				{
					direction: "inbound",
					text: "Pode me mandar uma proposta com as condições?",
					timestamp: daysAgo(referenceDate, 17, 10),
				},
				{
					direction: "outbound",
					text: "Enviei agora. Posso tirar alguma dúvida?",
					timestamp: daysAgo(referenceDate, 17, 12),
				},
			],
		},
		{
			id: "opp-patricia",
			contactName: "Patrícia Souza",
			phone: "5521999991003",
			source: "Site",
			owner: "Rafael",
			estimatedValue: 7_500,
			messages: [
				{
					direction: "inbound",
					text: "Tenho interesse. Qual o prazo para começar?",
					timestamp: daysAgo(referenceDate, 4, 11),
				},
				{
					direction: "outbound",
					text: "Conseguimos começar na próxima semana.",
					timestamp: daysAgo(referenceDate, 4, 12),
				},
				{
					direction: "inbound",
					text: "Perfeito, como faço o pagamento por PIX?",
					timestamp: daysAgo(referenceDate, 3, 14),
				},
			],
		},
		{
			id: "opp-bruno",
			contactName: "Bruno Lima",
			phone: "5521999991004",
			source: "Google Ads",
			owner: "Camila",
			estimatedValue: 2_100,
			messages: [
				{
					direction: "inbound",
					text: "Quanto custa o serviço?",
					timestamp: daysAgo(referenceDate, 36, 9),
				},
				{
					direction: "outbound",
					text: "O investimento começa em R$ 2.100. Quer que eu detalhe?",
					timestamp: daysAgo(referenceDate, 35, 10),
				},
			],
		},
		{
			id: "opp-closed",
			contactName: "Renata Dias",
			phone: "5521999991005",
			source: "Orgânico",
			owner: "Rafael",
			estimatedValue: 4_000,
			messages: [
				{
					direction: "inbound",
					text: "Obrigada, mas já fechei com outro fornecedor.",
					timestamp: daysAgo(referenceDate, 5, 16),
				},
			],
		},
	];
}

export function recoveryTextSummary(analysis: RecoveryAnalysis): string {
	return `${analysis.summary.recoverableCount} oportunidades recuperáveis, ${analysis.summary.highPriorityCount} de alta prioridade, somando ${money(analysis.summary.estimatedPipeline)} em pipeline estimado.`;
}
