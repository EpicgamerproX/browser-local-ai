import { OPFSFileStore } from "./opfs_file_store";
import { ResumableReplayState } from "./replay";
import { ResumableCheckpointRef, ResumableSessionHandle, ResumableSessionManifest, ResumableSessionManifestInit, ResumableSessionPaths, SessionManifestRebuildInputs } from "./types";
export declare class ResumableSessionExistsError extends Error {
    constructor(sessionId: string);
}
export interface ResumableSessionStoreOptions {
    rootPath?: string;
    now?: () => number;
}
export declare class ResumableSessionStore {
    private readonly files;
    private readonly rootPath;
    private readonly now;
    constructor(files: OPFSFileStore, opts?: ResumableSessionStoreOptions);
    getSessionPaths(sessionId: string): ResumableSessionPaths;
    getCheckpointRef(sessionId: string, checkpointId: string): ResumableCheckpointRef;
    createSession(sessionId: string, init?: ResumableSessionManifestInit): Promise<ResumableSessionHandle>;
    createNewSession(sessionId: string, init?: ResumableSessionManifestInit): Promise<ResumableSessionHandle>;
    openSession(sessionId: string): Promise<ResumableSessionHandle | undefined>;
    listSessions(): Promise<ResumableSessionHandle[]>;
    /** Repair and maintain an idle session. Caller must hold its lifetime lock. */
    repairSession(session: ResumableSessionHandle): Promise<ResumableReplayState>;
    /** Active sessions are read without mutation; idle sessions are repaired first. */
    inspectSession(session: ResumableSessionHandle): Promise<ResumableReplayState>;
    deleteSession(sessionId: string): Promise<void>;
    deleteKV(sessionId: string): Promise<void>;
    readManifest(sessionId: string): Promise<ResumableSessionManifest | undefined>;
    tryWriteManifest(manifest: ResumableSessionManifest): Promise<boolean>;
    private readCheckpointIndex;
    listCommittedCheckpoints(sessionId: string): Promise<ResumableCheckpointRef[]>;
    /** Remove incomplete checkpoints and complete directories lacking a commit. */
    reconcileCheckpoints(sessionId: string): Promise<ResumableCheckpointRef[]>;
    /** Under the session lock, retain the newest valid commits and remove all other directories. */
    pruneCommittedCheckpoints(sessionId: string, retain?: number): Promise<ResumableCheckpointRef[]>;
    cleanupIncompleteCheckpoints(sessionId?: string): Promise<ResumableCheckpointRef[]>;
    getManifestRebuildInputs(sessionId: string): Promise<SessionManifestRebuildInputs | undefined>;
}
//# sourceMappingURL=session_store.d.ts.map