import { ResumeProbeResult } from "../types";
import { OPFSFileStore } from "./opfs_file_store";
import { ResumableReplayState } from "./replay";
import { ResumableSessionHandle } from "./types";
/** Present recovery eligibility from the same snapshot used for replay. */
export declare function probeReplayState(state: ResumableReplayState): ResumeProbeResult;
export declare function probeResumableSession(files: OPFSFileStore, session: ResumableSessionHandle): Promise<ResumeProbeResult>;
//# sourceMappingURL=session_probe.d.ts.map