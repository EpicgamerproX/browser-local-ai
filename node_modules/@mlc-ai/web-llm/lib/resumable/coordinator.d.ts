import { ChatConfig, GenerationConfig } from "../config";
import { StreamGenerationState, StreamContinuationOptions } from "../streaming";
import { CustomLock } from "../support";
import { LLMChatPipeline, SampledGenerationStep, SamplePrefillOptions, SampleDecodeOptions } from "../llm_chat";
import { ChatCompletionRequest, ChatCompletionRequestNonStreaming, ChatCompletionRequestStreaming, CompletionCreateParams, CompletionCreateParamsNonStreaming, CompletionCreateParamsStreaming, ChatCompletionChunk, Completion } from "../openai_api_protocols";
import { ResumeProbeResult, ResumeResult, ResumeChatCompletionOptions } from "../types";
import { NormalizedResumableGenerationConfig, ResumableGenerationJournal } from "./generation";
import { OPFSFileStore } from "./opfs_file_store";
import { ResumableSessionStore } from "./session_store";
export interface ResumableEngineMetrics {
    journalAppendMs: number;
    checkpointWriteMs: number;
    kvRestoreMs: number;
    tokenReplayMs: number;
    resumeFirstTokenMs?: number;
}
export interface ResumableGenerationHost {
    getModel(modelId: string): {
        modelId: string;
        pipeline: LLMChatPipeline;
        chatConfig: ChatConfig;
        lock: CustomLock;
    } | undefined;
    resetInterrupt(): void;
    isInterrupted(): boolean;
    samplePrefill(input: ChatCompletionRequest | CompletionCreateParams, pipeline: LLMChatPipeline, chatConfig: ChatConfig, genConfig: GenerationConfig, options: SamplePrefillOptions & {
        reuseKVCache?: boolean;
    }): Promise<SampledGenerationStep>;
    sampleDecode(pipeline: LLMChatPipeline, genConfig: GenerationConfig, options: SampleDecodeOptions): Promise<SampledGenerationStep>;
    streamCurrentGeneration(request: ChatCompletionRequestStreaming | CompletionCreateParamsStreaming, model: string, pipeline: LLMChatPipeline, genConfig: GenerationConfig, timeReceived: number, state: StreamGenerationState, decodeStep: () => Promise<void>, options: StreamContinuationOptions): AsyncGenerator<ChatCompletionChunk | Completion, void, void>;
}
export interface ResumableCoordinatorOptions {
    host: ResumableGenerationHost;
    getFileStore: () => OPFSFileStore;
    getSessionStore: () => ResumableSessionStore;
    hasCustomLogitProcessor: (modelId: string) => boolean;
    onMetricsChanged?: (metrics: ResumableEngineMetrics) => void;
}
export declare class ResumableGenerationCoordinator {
    private readonly options;
    private lastMetrics?;
    constructor(options: ResumableCoordinatorOptions);
    private decodeGenerationStep;
    private finalizeResumedConversation;
    private finishContinuation;
    private streamContinuation;
    private prefillGeneration;
    private commitPrefill;
    streamGeneration(request: ChatCompletionRequestStreaming | CompletionCreateParamsStreaming, model: string, pipeline: LLMChatPipeline, chatConfig: ChatConfig, genConfig: GenerationConfig, timeReceived: number, streamState: StreamGenerationState, journal: ResumableGenerationJournal): AsyncGenerator<ChatCompletionChunk | Completion, void, void>;
    generate(input: ChatCompletionRequestNonStreaming | CompletionCreateParamsNonStreaming, modelId: string, pipeline: LLMChatPipeline, chatConfig: ChatConfig, genConfig: GenerationConfig, journal: ResumableGenerationJournal): Promise<string>;
    normalizeForRequest(request: ChatCompletionRequest, modelId: string): NormalizedResumableGenerationConfig | undefined;
    private resetMetrics;
    private metrics;
    tryCreateJournal(config: NormalizedResumableGenerationConfig | undefined): ResumableGenerationJournal | undefined;
    private recordGeneratedToken;
    private shouldCaptureDecodeCheckpoint;
    private shouldCapturePromptCheckpoint;
    private writePromptCheckpoint;
    private writeDecodeCheckpoint;
    private finishJournal;
    private recordEngineError;
    private closeStreamJournal;
    private createResumeCheckpointScheduler;
    private createResumeContinuationJournal;
    private recordPendingResumeToken;
    resume(sessionId: string, options?: ResumeChatCompletionOptions): Promise<ResumeResult | AsyncIterable<ChatCompletionChunk>>;
    private resumeEager;
    private openLockedSession;
    private readReplayState;
    private canAttemptContinuation;
    private readTextOnlyResult;
    listSessions(): Promise<ResumeProbeResult[]>;
    deleteSession(sessionId: string): Promise<void>;
    private tryRestoreKVResumeState;
    private restoreByTokenReplay;
    private makeTextOnlyResumeResult;
    private writeKVCheckpoint;
    private cleanupKVAfterFinish;
    private checkpointPayloadToKVData;
    private readBestKVCheckpoint;
    private getContinuationBlockReason;
}
//# sourceMappingURL=coordinator.d.ts.map