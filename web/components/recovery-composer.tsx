import { ArrowUp, Sparkles } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const AGENT_COMPOSER_CLASS_NAME =
	"flex w-full flex-col justify-between rounded-lg border bg-muted p-[11px] shadow-[inset_0_1px_1px_rgb(0_0_0/0.12)] transition-colors focus-within:border-muted-foreground/60 focus-within:ring-1 focus-within:ring-ring/40";

const SUGGESTIONS = [
	"Prioritize stalled high-value opportunities",
	"Show conversations that need human review",
	"Review what is due in the recovery queue",
];

export function RecoveryComposer({
	onNavigate,
}: {
	onNavigate?: (section: "queue" | "conversations" | "opportunities") => void;
}) {
	const [value, setValue] = useState("");
	const [notice, setNotice] = useState(false);

	const submit = () => {
		if (!value.trim()) return;
		setNotice(true);
	};

	return (
		<div className="w-full max-w-3xl">
			<div className={AGENT_COMPOSER_CLASS_NAME}>
				<textarea
					value={value}
					onChange={(event) => {
						setValue(event.currentTarget.value);
						setNotice(false);
					}}
					onKeyDown={(event) => {
						if (event.key === "Enter" && !event.shiftKey) {
							event.preventDefault();
							submit();
						}
					}}
					rows={3}
					placeholder="Tell Oplera what revenue should be recovered."
					className="min-h-20 w-full resize-none bg-transparent px-1 py-0.5 text-sm outline-none placeholder:text-muted-foreground"
				/>
				<div className="mt-2 flex items-center justify-between gap-3">
					<div className="flex items-center gap-2">
						<Sparkles className="size-3.5 text-muted-foreground" />
						<span className="text-xs text-muted-foreground">Operational surface</span>
						<Badge variant="outline" className="h-4 px-1.5 text-[9px]">
							Demo-only
						</Badge>
					</div>
					<Button
						type="button"
						size="icon-sm"
						aria-label="Preview recovery request"
						disabled={!value.trim()}
						onClick={submit}
					>
						<ArrowUp className="size-3.5" />
					</Button>
				</div>
			</div>
			<p className="flex min-h-8 items-center px-px text-xs text-muted-foreground">
				{notice
					? "This composer is visual-only in V0.4.2. It does not add a new agent or execution route."
					: "Use the existing recovery surfaces below. No new natural-language execution is enabled."}
			</p>
			<div className="pt-1">
				<p className="flex h-7 items-center text-xs text-muted-foreground">Suggested views</p>
				{SUGGESTIONS.map((suggestion, index) => (
					<button
						key={suggestion}
						type="button"
						onClick={() => {
							setValue(suggestion);
							setNotice(false);
							if (index === 0) onNavigate?.("queue");
							if (index === 1) onNavigate?.("conversations");
							if (index === 2) onNavigate?.("opportunities");
						}}
						className="flex h-[42px] w-full items-center border-t text-left outline-none transition-colors hover:bg-muted/50 focus-visible:bg-muted/50"
					>
						<span className="min-w-0 flex-1 font-medium text-sm">{suggestion}</span>
						<ArrowUp className="size-3.5 rotate-45 text-muted-foreground" />
					</button>
				))}
			</div>
		</div>
	);
}
