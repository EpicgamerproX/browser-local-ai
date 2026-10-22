import { OPFSFileStore } from "./opfs_file_store";
import type { ResumableSessionStore } from "./session_store";
import { ResumableCheckpointRef } from "./types";
type CheckpointByteSource = ArrayBufferLike | ArrayBufferView<ArrayBufferLike>;
export interface ResumableCheckpointPageGroup {
    groupId: number;
    layerStart: number;
    layerEnd: number;
    data: CheckpointByteSource;
    fileName?: string;
}
export interface ResumableCheckpointWriteInput {
    sessionId: string;
    checkpointId: string;
    processedSeqLen: number;
    layoutHash?: string;
    metadata?: Record<string, unknown>;
    pageGroups: ResumableCheckpointPageGroup[];
    nextLogits?: CheckpointByteSource;
}
interface CheckpointFileMeta {
    path: string;
    bytes: number;
    crc32c: string;
}
export type StoredCheckpointFileMeta = CheckpointFileMeta;
export interface StoredCheckpointPageGroup extends StoredCheckpointFileMeta {
    groupId: number;
    layerStart: number;
    layerEnd: number;
}
export interface StoredResumableCheckpoint {
    checkpointId: string;
    processedSeqLen: number;
    layoutHash?: string;
    createdAtMs: number;
    pageGroups: StoredCheckpointPageGroup[];
    nextLogits?: StoredCheckpointFileMeta;
    metadata?: Record<string, unknown>;
}
export interface ResumableCheckpointPayload {
    meta: StoredResumableCheckpoint;
    pageGroups: Array<StoredCheckpointPageGroup & {
        data: Uint8Array;
    }>;
    nextLogits?: StoredCheckpointFileMeta & {
        data: Uint8Array;
    };
}
/** Invalid stored bytes, as distinct from a transient storage read failure. */
export declare class InvalidCheckpointError extends Error {
}
export declare class ResumableCheckpointWriter {
    private readonly files;
    private readonly sessions;
    private readonly now;
    constructor(files: OPFSFileStore, sessions: ResumableSessionStore, now?: () => number);
    writeCheckpoint(input: ResumableCheckpointWriteInput): Promise<ResumableCheckpointRef>;
}
export declare function readResumableCheckpointPayload(files: OPFSFileStore, ref: ResumableCheckpointRef): Promise<ResumableCheckpointPayload | undefined>;
export {};
//# sourceMappingURL=checkpoint_writer.d.ts.map