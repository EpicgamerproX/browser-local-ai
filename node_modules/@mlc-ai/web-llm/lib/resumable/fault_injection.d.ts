export type ResumableFaultPoint = "journal.before_append" | "journal.after_append" | "checkpoint.after_page_group" | "checkpoint.after_next_logits" | "checkpoint.after_meta" | "checkpoint.after_complete" | "checkpoint.before_commit" | "checkpoint.after_commit";
export interface ResumableFaultContext {
    path?: string;
    sessionId?: string;
    checkpointId?: string;
    processedSeqLen?: number;
    groupId?: number;
    recordType?: number;
    seqNo?: number;
}
export type ResumableFaultHook = (point: ResumableFaultPoint, context: ResumableFaultContext) => void | Promise<void>;
export declare class ResumableInjectedFault extends Error {
    readonly point: ResumableFaultPoint;
    readonly context: ResumableFaultContext;
    constructor(point: ResumableFaultPoint, context?: ResumableFaultContext);
}
export declare function isResumableInjectedFault(err: unknown): boolean;
export declare function setResumableFaultHook(hook?: ResumableFaultHook): () => void;
export declare function triggerResumableFault(point: ResumableFaultPoint, context?: ResumableFaultContext): Promise<void>;
//# sourceMappingURL=fault_injection.d.ts.map