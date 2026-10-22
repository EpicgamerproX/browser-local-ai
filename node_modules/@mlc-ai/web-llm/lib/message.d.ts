import { AppConfig, ChatOptions } from "./config";
import { InitProgressReport, LogLevel } from "./types";
import { ResumeProbeResult, ResumeResult } from "./types";
import { ChatCompletionRequestStreaming, ChatCompletionRequestNonStreaming, ChatCompletion, ChatCompletionChunk, CompletionCreateParamsNonStreaming, CompletionCreateParamsStreaming, Completion, EmbeddingCreateParams, CreateEmbeddingResponse } from "./openai_api_protocols/index";
/**
 * Message kind used by worker
 */
type RequestKind = "reload" | "runtimeStatsText" | "interruptGenerate" | "unload" | "resetChat" | "getMaxStorageBufferBindingSize" | "getGPUVendor" | "forwardTokensAndSample" | "chatCompletionNonStreaming" | "completionNonStreaming" | "embedding" | "listResumableSessions" | "resumeChatCompletion" | "resumeChatCompletionStreamInit" | "deleteResumableSession" | "getMessage" | "chatCompletionStreamInit" | "completionStreamInit" | "completionStreamNextChunk" | "completionStreamReturn" | "customRequest" | "keepAlive" | "setLogLevel" | "setAppConfig";
export interface ReloadParams {
    modelId: string[];
    chatOpts?: ChatOptions[];
}
export interface ResetChatParams {
    keepStats: boolean;
    modelId?: string;
}
export interface GetMessageParams {
    modelId?: string;
}
export interface RuntimeStatsTextParams {
    modelId?: string;
}
export interface ForwardTokensAndSampleParams {
    inputIds: Array<number>;
    isPrefill: boolean;
    modelId?: string;
}
export interface ChatCompletionNonStreamingParams {
    request: ChatCompletionRequestNonStreaming;
    modelId: string[];
    chatOpts?: ChatOptions[];
}
export interface ChatCompletionStreamInitParams {
    request: ChatCompletionRequestStreaming;
    selectedModelId: string;
    streamId: string;
    modelId: string[];
    chatOpts?: ChatOptions[];
}
export interface CompletionNonStreamingParams {
    request: CompletionCreateParamsNonStreaming;
    modelId: string[];
    chatOpts?: ChatOptions[];
}
export interface CompletionStreamInitParams {
    request: CompletionCreateParamsStreaming;
    selectedModelId: string;
    streamId: string;
    modelId: string[];
    chatOpts?: ChatOptions[];
}
export interface EmbeddingParams {
    request: EmbeddingCreateParams;
    modelId: string[];
    chatOpts?: ChatOptions[];
}
export interface CompletionStreamNextChunkParams {
    streamId: string;
}
export interface ResumeChatCompletionParams {
    sessionId: string;
    options?: {
        continueGeneration?: boolean;
        stream?: boolean;
    };
    streamId?: string;
}
export interface DeleteResumableSessionParams {
    sessionId: string;
}
export interface CustomRequestParams {
    requestName: string;
    requestMessage: string;
}
export type MessageContent = ReloadParams | ResetChatParams | GetMessageParams | RuntimeStatsTextParams | ForwardTokensAndSampleParams | ChatCompletionNonStreamingParams | ChatCompletionStreamInitParams | CompletionNonStreamingParams | CompletionStreamInitParams | EmbeddingParams | ResumeChatCompletionParams | DeleteResumableSessionParams | CompletionStreamNextChunkParams | CustomRequestParams | InitProgressReport | LogLevel | string | null | number | ChatCompletion | ChatCompletionChunk | CreateEmbeddingResponse | Completion | ResumeProbeResult[] | ResumeResult | AppConfig | void;
/**
 * The message used in exchange between worker
 * and the main thread.
 */
export type WorkerRequest = {
    kind: RequestKind;
    uuid: string;
    content: MessageContent;
};
type HeartbeatWorkerResponse = {
    kind: "heartbeat";
    uuid: string;
};
type OneTimeWorkerResponse = {
    kind: "return" | "throw";
    uuid: string;
    content: MessageContent;
};
type InitProgressWorkerResponse = {
    kind: "initProgressCallback";
    uuid: string;
    content: InitProgressReport;
};
export type WorkerResponse = OneTimeWorkerResponse | InitProgressWorkerResponse | HeartbeatWorkerResponse;
export {};
//# sourceMappingURL=message.d.ts.map