import { GenerationConfig } from "../config";
import { ReplayedGenerationToken } from "../llm_chat";
import { NormalizedResumableGenerationConfig } from "./generation";
import { OPFSFileStore } from "./opfs_file_store";
import { JournalRecord, JournalScanResult } from "./journal";
import { ResumableSessionHandle } from "./types";
export interface ResumableReplayState {
    sessionId: string;
    modelId: string;
    request?: unknown;
    promptTokenIds: number[];
    assistantPrefixTokenIds: number[];
    generatedTokens: ReplayedGenerationToken[];
    recoveredText: string;
    emittedTokens: number;
    processedSeqLen: number;
    generationConfig?: GenerationConfig;
    resumableConfig?: NormalizedResumableGenerationConfig;
    scanStoppedReason?: JournalScanResult["stoppedReason"];
    finished: boolean;
    recordCount: number;
    hasPromptTokens: boolean;
    hasGenerationConfig: boolean;
    hasResumableGenerationConfig: boolean;
    hasUnsupportedGrammarReplay: boolean;
    aborted: boolean;
    engineErrorMessage?: string;
}
export declare function getGenerationConfig(record: JournalRecord): GenerationConfig | undefined;
export declare function getResumableGenerationConfig(record: JournalRecord): NormalizedResumableGenerationConfig | undefined;
export declare function hasUnsupportedGrammarReplay(genConfig?: GenerationConfig): boolean;
export declare function applyGeneratedTokenText(previousText: string, textDelta: string, textPrefixLength?: number): string;
export declare function readResumableReplayState(files: OPFSFileStore, session: ResumableSessionHandle): Promise<ResumableReplayState>;
//# sourceMappingURL=replay.d.ts.map