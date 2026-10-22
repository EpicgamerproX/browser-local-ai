export interface StreamGenerationState {
    id: string;
    created: number;
    prevMessageLength: number;
}
export interface StreamContinuationOptions {
    emitCurrent?: boolean;
    skipEmptyDelta?: boolean;
    completionTokenOffset?: number;
    beforeFinalChunk?: () => Promise<void>;
}
export declare function onceAsync(action: () => Promise<void>): () => Promise<void>;
/** Ensure return() releases resources even before an async generator starts. */
export declare function managedAsyncIterable<T>(source: AsyncGenerator<T, void, void>, cleanup: () => Promise<void>): AsyncIterable<T>;
/** Defer constructing a resource-owning stream until its first operation. */
export declare function lazyAsyncIterable<T>(factory: () => Promise<AsyncIterable<T>>): AsyncIterable<T>;
export declare function isAsyncIterable<T>(value: unknown): value is AsyncIterable<T>;
//# sourceMappingURL=streaming.d.ts.map