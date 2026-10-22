import { GenerationConfig } from "../config";
import { ResumableGenerationConfig } from "../types";
import { OPFSFileStore } from "./opfs_file_store";
import { CheckpointCommitPayload } from "./journal";
import { ResumableSessionStore } from "./session_store";
import { ResumableSessionHandle } from "./types";
export interface NormalizedResumableGenerationConfig {
    enabled: true;
    sessionId: string;
    checkpointIntervalTokens: number;
    checkpointPrompt: boolean;
    durabilityMode: "exact" | "relaxed";
    strictPersistence: boolean;
    storeCheckpointLogits: boolean;
}
export interface ResumableGenerationJournalInit {
    modelId: string;
    request: unknown;
    promptTokenIds: number[];
    assistantPrefixTokenIds: number[];
    generationConfig: GenerationConfig;
}
export interface ResumableGeneratedTokenInput {
    globalTokenPos: number;
    tokenId: number;
    textDelta: string;
    textPrefixLength: number;
    rngState?: unknown;
    logprob?: unknown;
}
export interface ResumableGenerationEndInput {
    finishReason?: string;
    emittedTokens: number;
}
export interface EngineErrorInput {
    err: unknown;
}
export declare function normalizeResumableGenerationConfig(config?: ResumableGenerationConfig | null): NormalizedResumableGenerationConfig | undefined;
export declare class ResumableGenerationJournal {
    private readonly files;
    private readonly sessions;
    private readonly config;
    private session?;
    private releaseSessionLock?;
    private seqNo;
    private emittedTokens;
    private disabled;
    private pendingError?;
    private pendingWrite;
    private lastFlushAtMs;
    constructor(files: OPFSFileStore, sessions: ResumableSessionStore, config: NormalizedResumableGenerationConfig);
    get sessionId(): string;
    get emittedTokenCount(): number;
    get checkpointPrompt(): boolean;
    get checkpointIntervalTokens(): number;
    get storeCheckpointLogits(): boolean;
    get strictPersistence(): boolean;
    get active(): boolean;
    begin(init: ResumableGenerationJournalInit): Promise<void>;
    attachExistingSession(session: ResumableSessionHandle, emittedTokens: number): Promise<void>;
    recordGeneratedToken(input: ResumableGeneratedTokenInput): Promise<void>;
    recordCheckpointCommit(payload: CheckpointCommitPayload): Promise<void>;
    recordGenerationEnd(input: ResumableGenerationEndInput): Promise<void>;
    recordEngineError(input: EngineErrorInput): Promise<void>;
    close(): Promise<void>;
    refreshSeqNo(): Promise<void>;
    private writeInitialRecords;
    private nextSeqNo;
    private append;
    private flush;
}
//# sourceMappingURL=generation.d.ts.map