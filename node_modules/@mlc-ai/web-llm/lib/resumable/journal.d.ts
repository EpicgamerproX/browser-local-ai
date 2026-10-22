import { OPFSFileStore } from "./opfs_file_store";
export declare const JOURNAL_MAGIC = 1464618058;
export declare enum JournalRecordType {
    SessionBegin = 1,
    PromptTokens = 2,
    AssistantPrefixTokens = 3,
    GenerationConfig = 4,
    GeneratedToken = 5,
    CheckpointCommit = 6,
    GenerationFinished = 7,
    GenerationAborted = 8,
    EngineError = 9
}
export interface SessionBeginPayload {
    sessionId: string;
    modelId?: string;
    createdAtMs?: number;
    request?: unknown;
}
export interface TokenIdsPayload {
    tokenIds: number[];
    text?: string;
}
export interface GenerationConfigPayload {
    config: unknown;
}
export interface GeneratedTokenPayload {
    globalTokenPos: number;
    tokenId: number;
    textDelta: string;
    /**
     * Number of UTF-16 code units retained from the previously recovered text.
     * Absent on legacy append-only records.
     */
    textPrefixLength?: number;
    rngState?: unknown;
    logprob?: unknown;
}
export interface CheckpointCommitPayload {
    checkpointId: string;
    processedSeqLen: number;
    path?: string;
    layoutHash?: string;
}
export interface GenerationFinishedPayload {
    finishReason?: string;
    emittedTokens?: number;
}
export interface GenerationAbortedPayload {
    reason?: string;
}
export interface EngineErrorPayload {
    message: string;
    name?: string;
    stack?: string;
}
export type JournalRecord = JournalRecordBase<JournalRecordType.SessionBegin, SessionBeginPayload> | JournalRecordBase<JournalRecordType.PromptTokens, TokenIdsPayload> | JournalRecordBase<JournalRecordType.AssistantPrefixTokens, TokenIdsPayload> | JournalRecordBase<JournalRecordType.GenerationConfig, GenerationConfigPayload> | JournalRecordBase<JournalRecordType.GeneratedToken, GeneratedTokenPayload> | JournalRecordBase<JournalRecordType.CheckpointCommit, CheckpointCommitPayload> | JournalRecordBase<JournalRecordType.GenerationFinished, GenerationFinishedPayload> | JournalRecordBase<JournalRecordType.GenerationAborted, GenerationAbortedPayload> | JournalRecordBase<JournalRecordType.EngineError, EngineErrorPayload>;
export interface JournalRecordBase<T extends JournalRecordType, P extends object> {
    type: T;
    seqNo: number;
    createdAtMs: number;
    payload: P;
}
export interface DecodedJournalRecord {
    record: JournalRecord;
    nextOffset: number;
}
export interface JournalScanResult {
    records: JournalRecord[];
    validBytes: number;
    stoppedReason?: "partial_record" | "bad_magic" | "crc_mismatch" | "invalid_payload";
}
export declare function encodeJournalRecord(record: JournalRecord): ArrayBuffer;
export declare function decodeJournalRecordAt(data: ArrayBuffer, offset?: number): DecodedJournalRecord;
export declare function scanJournalRecords(data: ArrayBuffer): JournalScanResult;
export declare function journalLockPath(path: string): string;
export declare function appendJournalRecord(store: OPFSFileStore, path: string, record: JournalRecord): Promise<void>;
export declare function readJournalRecords(store: OPFSFileStore, path: string): Promise<JournalScanResult>;
/**
 * Truncate a torn or corrupt journal tail while retaining every validated
 * record before it. Callers must hold the session lock while repairing.
 */
export declare function repairJournalTail(store: OPFSFileStore, path: string): Promise<JournalScanResult>;
//# sourceMappingURL=journal.d.ts.map