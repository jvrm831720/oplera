import { buildDemoOperatorConsole } from "../../../api/autonomy/demo.ts";
import { buildOperatorConsoleFromAnalysis } from "../../../api/autonomy/legacy-adapter.ts";
import {
	type OperatorConsoleSnapshot,
	operatorConsoleSnapshotSchema,
} from "../../../api/autonomy/types.ts";
import type { RecoveryAnalysis } from "../../../api/domain/recovery.ts";
import type {
	AnalyzeRecoveryInput,
	AnalyzeRecoveryOutput,
} from "../../../api/tools/analyze-recovery.ts";
import type {
	OperateRecoveryInput,
	OperateRecoveryOutput,
} from "../../../api/tools/operate-recovery.ts";
import { useMcpState } from "../../context.tsx";
import OperatorConsole from "./operator-console.tsx";

type RecoveryInput = AnalyzeRecoveryInput | OperateRecoveryInput;
type RecoveryOutput = AnalyzeRecoveryOutput | OperateRecoveryOutput;

function LoadingState({ label }: { label: string }) {
	return (
		<div className="flex min-h-dvh items-center justify-center bg-[#f7f8f6] p-6">
			<div className="flex items-center gap-3 text-xs text-[#626862]">
				<span className="size-4 animate-spin rounded-full border-2 border-[#d8ddd6] border-t-[#3f493f]" />
				{label}
			</div>
		</div>
	);
}

function EmptyState() {
	return (
		<div className="flex min-h-dvh items-center justify-center bg-[#f7f8f6] p-6">
			<div className="max-w-md rounded-md border border-[#e1e4df] bg-white p-6 text-center">
				<div className="mx-auto flex size-8 items-center justify-center rounded-sm bg-[#c6ff69] text-xs font-black">
					O
				</div>
				<h1 className="mt-4 text-lg font-semibold">Oplera</h1>
				<p className="mt-2 text-xs leading-5 text-[#6f756e]">
					Autonomous Revenue Recovery Agent. Execute uma análise ou abra{" "}
					<strong>/demo</strong> para ver o ciclo completo.
				</p>
			</div>
		</div>
	);
}

function toSnapshot(output: RecoveryOutput): OperatorConsoleSnapshot {
	const parsed = operatorConsoleSnapshotSchema.safeParse(output);
	if (parsed.success) return parsed.data;
	return buildOperatorConsoleFromAnalysis(output as RecoveryAnalysis);
}

export default function RecoveryPage() {
	const state = useMcpState<RecoveryInput, RecoveryOutput>();
	const isDemo = window.location.pathname === "/demo";

	if (isDemo) return <OperatorConsole snapshot={buildDemoOperatorConsole()} />;
	if (state.status === "initializing")
		return <LoadingState label="Connecting to Oplera runtime..." />;
	if (state.status === "tool-input")
		return <LoadingState label="Evaluating revenue recovery context..." />;
	if (state.status === "connected") return <EmptyState />;
	if (state.status === "error") {
		return (
			<div className="flex min-h-dvh items-center justify-center bg-[#f7f8f6] p-6">
				<div className="max-w-lg rounded-md border border-red-200 bg-white p-5">
					<p className="text-sm font-semibold text-red-700">
						Não foi possível abrir a Operator Console
					</p>
					<p className="mt-2 text-xs text-red-600">{state.error}</p>
				</div>
			</div>
		);
	}
	if (!state.toolResult) return <EmptyState />;
	return <OperatorConsole snapshot={toSnapshot(state.toolResult)} />;
}
