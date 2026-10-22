export interface OPFSFileStore {
    read(path: string): Promise<ArrayBuffer | undefined>;
    write(path: string, data: BufferSource): Promise<void>;
    append(path: string, data: BufferSource): Promise<void>;
    remove(path: string, opts?: {
        recursive?: boolean;
    }): Promise<void>;
    list(path: string): Promise<string[]>;
    mkdir(path: string): Promise<void>;
    lock(path: string): Promise<() => void>;
    tryLock(path: string): Promise<(() => void) | undefined>;
}
export declare class CrossContextLockUnavailableError extends Error {
    constructor(path: string);
}
export declare class BrowserOPFSFileStore implements OPFSFileStore {
    private readonly root;
    constructor(root?: FileSystemDirectoryHandle | Promise<FileSystemDirectoryHandle>);
    read(path: string): Promise<ArrayBuffer | undefined>;
    write(path: string, data: BufferSource): Promise<void>;
    append(path: string, data: BufferSource): Promise<void>;
    remove(path: string, opts?: {
        recursive?: boolean;
    }): Promise<void>;
    list(path: string): Promise<string[]>;
    mkdir(path: string): Promise<void>;
    lock(path: string): Promise<() => void>;
    tryLock(path: string): Promise<(() => void) | undefined>;
    private acquireLock;
    private getDirectory;
    private getFile;
    private createWritable;
    private createSyncAccessHandle;
}
export declare function createOPFSFileStore(root?: FileSystemDirectoryHandle | Promise<FileSystemDirectoryHandle>): OPFSFileStore;
//# sourceMappingURL=opfs_file_store.d.ts.map