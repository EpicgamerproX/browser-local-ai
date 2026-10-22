export declare const MODEL_PACKAGE_MANIFEST_FILENAME = "mlc-model-manifest.json";
export declare const TENSOR_CACHE_MANIFEST_FILENAME = "tensor-cache.json";
export declare const ARTIFACT_SCHEMA_VERSION = 1;
export interface PromptInsertion {
    prefix_token_ids: number[];
    placeholder_token_id: number;
    suffix_token_ids: number[];
}
export interface AudioDecodeProcessor {
    kind: "audio_decode";
    format: "pcm_f32";
    sample_rate_hz: number;
    channels: 1;
    min_samples: number;
    max_samples: number;
}
export interface ImageResize {
    mode: "stretch" | "center_crop";
    height: number;
    width: number;
}
export interface ImageDecodeProcessor {
    kind: "image_decode";
    format: "rgb_u8";
    layout: "nhwc";
    resize: ImageResize;
    num_embeddings: number;
}
export type TaskInputProcessor = string | AudioDecodeProcessor | ImageDecodeProcessor;
export interface TaskInput {
    processor: TaskInputProcessor;
    adapter?: string;
    prompt?: PromptInsertion;
}
export interface TaskSpec {
    executor: string;
    inputs: Record<string, TaskInput>;
    output: string;
}
export interface WeightContract {
    manifest: "tensor-cache.json";
    parameter_schema_id: string;
}
export interface ModelPackageResourceURLs {
    chatConfigUrl: string;
    tensorCacheBaseUrl: string;
    tensorCacheManifestUrl: string;
}
export interface ModelPackageManifest {
    schema: "mlc.model-package";
    schema_version: 1;
    chat_config: "mlc-chat-config.json";
    interface_id: string;
    weights: WeightContract;
    tasks: Record<string, TaskSpec>;
}
export interface ProgramSpec {
    kind: string;
    exports: Record<string, string>;
    adapters: Record<string, string>;
    /** Tensor dtype an adapter takes when it differs from the processor's natural type. */
    adapter_dtypes: Record<string, string>;
}
export interface ResourceRequirements {
    required_features: string[];
    max_storage_buffer_binding_size: number;
    estimated_device_memory_bytes: number;
}
export interface CompiledProgramArtifact {
    schema: "mlc.compiled-program";
    schema_version: 1;
    interface_id: string;
    parameter_schema_id: string;
    programs: Record<string, ProgramSpec>;
    resources: ResourceRequirements;
}
/** The compiled prefill and decode functions and what they take next to the KV cache. */
export interface GenerationExports {
    inputs: "tokens" | "embeds";
    prefill: string;
    decode: string;
}
export interface ResolvedChatCompletionArtifact {
    task: TaskSpec;
    program: ProgramSpec;
    generation: GenerationExports;
    textInput: TaskInput;
    audioInput?: TaskInput & {
        processor: AudioDecodeProcessor;
        adapter: string;
        prompt: PromptInsertion;
    };
    imageInput?: TaskInput & {
        processor: ImageDecodeProcessor;
        adapter: string;
        prompt: PromptInsertion;
        /** The pixel tensor dtype the compiled adapter takes. */
        dtype: "uint8" | "uint32";
    };
    compiled: CompiledProgramArtifact;
}
/** Hash the task description the same way MLC does. */
export declare function computeInterfaceId(tasks: Record<string, TaskSpec>): Promise<string>;
export declare function parseModelPackageManifest(value: unknown): ModelPackageManifest;
/** URLs of the chat config and tensor cache, relative to the model URL. */
export declare function resolveModelPackageResourceURLs(modelUrl: string, modelPackage?: ModelPackageManifest): ModelPackageResourceURLs;
export declare function parseCompiledProgramArtifact(value: unknown): CompiledProgramArtifact;
export declare function resolveChatCompletionArtifact(modelPackage: ModelPackageManifest, compiled: CompiledProgramArtifact): ResolvedChatCompletionArtifact;
/** Parse a downloaded manifest and check its interface_id against its tasks. */
export declare function loadModelPackageManifest(data: ArrayBuffer): Promise<ModelPackageManifest>;
//# sourceMappingURL=artifact_manifest.d.ts.map