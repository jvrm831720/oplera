import {
	Activity,
	Bot,
	CheckCircle2,
	Inbox,
	Menu,
	MessageSquare,
	Moon,
	Search,
	ShieldCheck,
	Sparkles,
	Sun,
	Target,
	UserRoundCheck,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button.tsx";
import {
	Command,
	CommandDialog,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
	CommandShortcut,
} from "@/components/ui/command.tsx";
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet.tsx";
import { agentStatusLabel, fullDateTime } from "@/lib/pt-br.ts";
import { cn } from "@/lib/utils.ts";
import SellerCopilotPage from "@/tools/recovery/seller-copilot-page.tsx";

export type OpleraSection =
	| "overview"
	| "queue"
	| "opportunities"
	| "conversations"
	| "copilot"
	| "policies"
	| "activity";

type NavigationItem = {
	id: OpleraSection;
	label: string;
	icon: React.ComponentType<{ className?: string }>;
	shortcut: string;
};

export const OPLERA_NAVIGATION: NavigationItem[] = [
	{ id: "overview", label: "Visão geral", icon: Target, shortcut: "1" },
	{ id: "queue", label: "Fila de recuperação", icon: Inbox, shortcut: "2" },
	{
		id: "opportunities",
		label: "Oportunidades",
		icon: UserRoundCheck,
		shortcut: "3",
	},
	{
		id: "conversations",
		label: "Conversas",
		icon: MessageSquare,
		shortcut: "4",
	},
	{ id: "copilot", label: "Copilot", icon: Sparkles, shortcut: "5" },
	{ id: "policies", label: "Políticas", icon: ShieldCheck, shortcut: "6" },
	{ id: "activity", label: "Atividade", icon: Activity, shortcut: "7" },
];

function BrandMark() {
	return (
		<div className="flex size-8 items-center justify-center rounded-md bg-primary text-xs font-black text-primary-foreground shadow-2xs">
			O
		</div>
	);
}

function NavigationButtons({
	page,
	onNavigate,
	mobile = false,
}: {
	page: OpleraSection;
	onNavigate: (page: OpleraSection) => void;
	mobile?: boolean;
}) {
	return OPLERA_NAVIGATION.map((item) => {
		const Icon = item.icon;
		const active = page === item.id;
		return (
			<Button
				key={item.id}
				type="button"
				variant="ghost"
				size={mobile ? "default" : "icon"}
				aria-label={item.label}
				aria-current={active ? "page" : undefined}
				onClick={() => onNavigate(item.id)}
				className={cn(
					"text-muted-foreground",
					mobile && "w-full justify-start gap-3",
					active &&
						"bg-muted text-foreground hover:bg-muted hover:text-foreground",
				)}
			>
				<Icon className="size-4" />
				{mobile ? (
					<span>{item.label}</span>
				) : (
					<span className="sr-only">{item.label}</span>
				)}
			</Button>
		);
	});
}

function ThemeButton() {
	const { resolvedTheme, setTheme } = useTheme();
	const dark = resolvedTheme === "dark";
	return (
		<Button
			type="button"
			variant="ghost"
			size="icon"
			aria-label={dark ? "Usar tema claro" : "Usar tema escuro"}
			onClick={() => setTheme(dark ? "light" : "dark")}
		>
			{dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
		</Button>
	);
}

export function OpleraShell({
	page,
	onNavigate,
	companyName,
	version,
	generatedAt,
	agentStatus,
	children,
}: {
	page: OpleraSection;
	onNavigate: (page: OpleraSection) => void;
	companyName: string;
	version: string;
	generatedAt: string;
	agentStatus: string;
	children: React.ReactNode;
}) {
	const [mobileOpen, setMobileOpen] = useState(false);
	const [commandOpen, setCommandOpen] = useState(false);

	useEffect(() => {
		const handler = (event: KeyboardEvent) => {
			if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
				event.preventDefault();
				setCommandOpen((open) => !open);
			}
		};
		window.addEventListener("keydown", handler);
		return () => window.removeEventListener("keydown", handler);
	}, []);

	const navigate = (section: OpleraSection) => {
		onNavigate(section);
		setMobileOpen(false);
		setCommandOpen(false);
	};
	const demoMode = window.location.pathname === "/demo";

	return (
		<div className="flex min-h-dvh flex-col bg-background text-foreground">
			<header className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
				<Button
					type="button"
					variant="ghost"
					size="icon"
					className="md:hidden"
					aria-label="Abrir navegação"
					onClick={() => setMobileOpen(true)}
				>
					<Menu className="size-4" />
				</Button>
				<div className="hidden md:block">
					<BrandMark />
				</div>
				<div className="hidden h-5 w-px bg-border md:block" />
				<div className="min-w-0">
					<p className="truncate text-sm font-medium">{companyName}</p>
					<p className="truncate text-[10px] text-muted-foreground">
						OPLERA · Agente de Receita
					</p>
				</div>
				<div className="ml-auto flex items-center gap-1.5">
					<Button
						type="button"
						variant="outline"
						size="sm"
						className="hidden gap-2 sm:flex"
						onClick={() => setCommandOpen(true)}
					>
						<Search className="size-3.5" />
						Navegar
						<span className="ml-2 text-[10px] text-muted-foreground">⌘K</span>
					</Button>
					<div className="hidden items-center gap-1.5 px-1 text-[10px] text-muted-foreground lg:flex">
						<CheckCircle2 className="size-3.5" />V{version} · Modo demonstração
					</div>
					<ThemeButton />
				</div>
			</header>

			<div className="flex min-h-0 flex-1">
				<nav
					aria-label="Navegação principal"
					className="hidden w-14 shrink-0 flex-col items-center gap-1 border-r py-3 md:flex"
				>
					<NavigationButtons page={page} onNavigate={navigate} />
					<div className="mt-auto flex flex-col items-center gap-2 px-2 pb-1">
						<div
							className="flex size-8 items-center justify-center rounded-md border bg-card text-muted-foreground"
							title={`Agente: ${agentStatusLabel(agentStatus)}`}
						>
							<Bot className="size-4" />
						</div>
					</div>
				</nav>
				<div className="min-w-0 flex-1 overflow-hidden">
					{page === "copilot" ? (
						<main className="min-h-[calc(100dvh-48px)] overflow-y-auto px-4 py-6 sm:px-6 md:px-8 md:py-8">
							<div className="mx-auto w-full max-w-[1120px]">
								<SellerCopilotPage demoMode={demoMode} />
							</div>
						</main>
					) : (
						children
					)}
					<footer className="border-t px-6 py-3 text-[10px] text-muted-foreground">
						Gerado em {fullDateTime.format(new Date(generatedAt))}. A
						orquestração continua executando no servidor.
					</footer>
				</div>
			</div>

			<Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
				<SheetContent side="left" className="w-64 gap-0 p-0">
					<SheetHeader className="border-b">
						<SheetTitle className="flex items-center gap-3">
							<BrandMark />
							<span>OPLERA</span>
						</SheetTitle>
					</SheetHeader>
					<nav className="flex flex-col gap-1 p-2" aria-label="Navegação móvel">
						<NavigationButtons page={page} onNavigate={navigate} mobile />
					</nav>
				</SheetContent>
			</Sheet>

			<CommandDialog
				open={commandOpen}
				onOpenChange={setCommandOpen}
				title="Navegação da Oplera"
				description="Acesse as superfícies existentes de recuperação de receita"
			>
				<Command>
					<CommandInput placeholder="Ir para uma área da Oplera..." />
					<CommandList>
						<CommandEmpty>Nenhuma área encontrada.</CommandEmpty>
						<CommandGroup heading="Recuperação de receita">
							{OPLERA_NAVIGATION.map((item) => {
								const Icon = item.icon;
								return (
									<CommandItem key={item.id} onSelect={() => navigate(item.id)}>
										<Icon />
										{item.label}
										<CommandShortcut>{item.shortcut}</CommandShortcut>
									</CommandItem>
								);
							})}
						</CommandGroup>
					</CommandList>
				</Command>
			</CommandDialog>
		</div>
	);
}
