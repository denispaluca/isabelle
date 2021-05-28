import { FileStat, FileType, FileSystemProvider, Uri, FileSystemError, FileChangeType, 
    FileChangeEvent, Event, Disposable, EventEmitter, ExtensionContext, workspace, 
    TextDocument, commands, window, ViewColumn } from "vscode";
import * as path from 'path';
import { SymbolEncoder, SymbolEntry } from "./symbol_encoder";

export class File implements FileStat {

    type: FileType;
    ctime: number;
    mtime: number;
    size: number;

    name: string;
    data?: Uint8Array;

    constructor(name: string) {
        this.type = FileType.File;
        this.ctime = Date.now();
        this.mtime = Date.now();
        this.size = 0;
        this.name = name;
    }
}

export class Directory implements FileStat {

    type: FileType;
    ctime: number;
    mtime: number;
    size: number;

    name: string;
    entries: Map<string, File | Directory>;

    constructor(name: string) {
        this.type = FileType.Directory;
        this.ctime = Date.now();
        this.mtime = Date.now();
        this.size = 0;
        this.name = name;
        this.entries = new Map();
    }
}

export type Entry = File | Directory;

export class IsabelleFSP implements FileSystemProvider {

    //#region Static Members
    public static readonly scheme = 'isabelle';
    private static symbolEncoder: SymbolEncoder;
    private static instance: IsabelleFSP;

    public static async register(context: ExtensionContext) {
        this.instance = new IsabelleFSP();

        context.subscriptions.push(
            workspace.registerFileSystemProvider(
                this.scheme, 
                this.instance
            ),
            workspace.onDidOpenTextDocument(this.instance.decideToCreate),
            window.onDidChangeActiveTextEditor(async ({document}) => {
                const newUri = await this.instance.decideToCreate(document);

                if(!newUri) return;

                await commands.executeCommand('workbench.action.closeActiveEditor');
                await commands.executeCommand('vscode.open', Uri.parse(newUri), ViewColumn.Active);
            })
        );
        
        workspace.updateWorkspaceFolders(0, 0, 
            { 
                uri: Uri.parse(`${IsabelleFSP.scheme}:/`), 
                name: "Isabelle - Files" 
            }
        );
    }

    public static updateSymbolEncoder(entries: SymbolEntry[]) {
        this.symbolEncoder = new SymbolEncoder(entries);
        this.instance.initWorkspace();
    }

    public static getFileUri(isabelleUri: string): string{
        return this.instance.isabelleToFile.get(isabelleUri) || isabelleUri;
    }

    public static getIsabelleUri(fileUri: string): string{
        return this.instance.fileToIsabelle.get(fileUri) || fileUri;
    }

    //#endregion


    private root = new Directory('');
    private rootPath: string;
    private isabelleToFile = new Map<string, string>();
    private fileToIsabelle = new Map<string, string>();

    public async initWorkspace(){
        this.rootPath = workspace.workspaceFolders[1].uri.path;
        const files = await workspace.findFiles('**/*.thy');
        await Promise.all(files.map(f => this.createFromOriginal(f)));
    }

    private getPath(path: string) {
        const re = new RegExp('^' + this.rootPath);
        return path.replace(re, '')
    }

    public async createFromOriginal(uri: Uri): Promise<Uri>{
        const data = await workspace.fs.readFile(uri);

        const newUri = uri.with({
            scheme: IsabelleFSP.scheme,
            path: this.getPath(uri.path)
        });
        const encodedData = IsabelleFSP.symbolEncoder.encode(data);
        this.writeFile(newUri, encodedData, {create: true, overwrite: true});
        const isabelleFile = newUri.toString();
        const discFile = uri.toString();
        this.isabelleToFile.set(isabelleFile, discFile);
        this.fileToIsabelle.set(discFile, isabelleFile);

        return newUri;
    }

    public async decideToCreate(doc: TextDocument): Promise<string | undefined> {
        if(
            doc.uri.scheme !== 'file' ||
            doc.languageId !== 'isabelle' ||
            !IsabelleFSP.symbolEncoder
        ){
            return;
        }

        return this.fileToIsabelle.get(doc.uri.toString()) || 
            (await this.createFromOriginal(doc.uri)).toString();
    }

    private async syncOriginal(uri: Uri, content: Uint8Array){
        const originUri = Uri.parse(this.isabelleToFile.get(uri.toString()));
        const decodedContent = IsabelleFSP.symbolEncoder.decode(content);
        workspace.fs.writeFile(originUri, decodedContent);
    }

    stat(uri: Uri): FileStat {
        return this._lookup(uri, false);
    }

    readDirectory(uri: Uri): [string, FileType][] {
        const entry = this._lookupAsDirectory(uri, false);
        const result: [string, FileType][] = [];
        for (const [name, child] of entry.entries) {
            result.push([name, child.type]);
        }
        return result;
    }

    // --- manage file contents

    readFile(uri: Uri): Uint8Array {
        const data = this._lookupAsFile(uri, false).data;
        if (data) {
            return data;
        }
        throw FileSystemError.FileNotFound();
    }

    async writeFile(uri: Uri, content: Uint8Array, options: { create: boolean, overwrite: boolean }): Promise<void> {
        if(!IsabelleFSP.symbolEncoder) return;

        const basename = path.posix.basename(uri.path);
        const parent = this._lookupParentDirectory(uri, true);
        let entry = parent.entries.get(basename);
        if (entry instanceof Directory) {
            throw FileSystemError.FileIsADirectory(uri);
        }
        if (!entry && !options.create) {
            throw FileSystemError.FileNotFound(uri);
        }
        if (entry && options.create && !options.overwrite) {
            throw FileSystemError.FileExists(uri);
        }

        if(entry){
            this.syncOriginal(uri, content);

            entry.mtime = Date.now();
            entry.size = content.byteLength;
            entry.data = content;

            this._fireSoon({ type: FileChangeType.Changed, uri });
            return;
        }

        entry = new File(basename);
        parent.entries.set(basename, entry);
        entry.mtime = Date.now();
        entry.size = content.byteLength;
        entry.data = content;
        this._fireSoon({ type: FileChangeType.Created, uri });
    }

    // --- manage files/folders

    rename(oldUri: Uri, newUri: Uri, options: { overwrite: boolean }): void {

        if (!options.overwrite && this._lookup(newUri, false)) {
            throw FileSystemError.FileExists(newUri);
        }

        const entry = this._lookup(oldUri, false);
        const oldParent = this._lookupParentDirectory(oldUri);

        const newParent = this._lookupParentDirectory(newUri);
        const newName = path.posix.basename(newUri.path);

        oldParent.entries.delete(entry.name);
        entry.name = newName;
        newParent.entries.set(newName, entry);

        this._fireSoon(
            { type: FileChangeType.Deleted, uri: oldUri },
            { type: FileChangeType.Created, uri: newUri }
        );
    }

    delete(uri: Uri): void {
        const dirname = uri.with({ path: path.posix.dirname(uri.path) });
        const basename = path.posix.basename(uri.path);
        const parent = this._lookupAsDirectory(dirname, false);
        if (!parent.entries.has(basename)) {
            throw FileSystemError.FileNotFound(uri);
        }
        parent.entries.delete(basename);
        parent.mtime = Date.now();
        parent.size -= 1;
        this._fireSoon({ type: FileChangeType.Changed, uri: dirname }, { uri, type: FileChangeType.Deleted });
    }

    createDirectory(uri: Uri): void {
        const basename = path.posix.basename(uri.path);
        const dirname = uri.with({ path: path.posix.dirname(uri.path) });
        const parent = this._lookupAsDirectory(dirname, false);

        const entry = new Directory(basename);
        parent.entries.set(entry.name, entry);
        parent.mtime = Date.now();
        parent.size += 1;
        this._fireSoon({ type: FileChangeType.Changed, uri: dirname }, { type: FileChangeType.Created, uri });
    }

    // --- lookup

    private _lookup(uri: Uri, silent: boolean, create?: boolean): Entry | undefined {
        const parts = uri.path.split('/');
        let entry: Entry = this.root;
        for (const part of parts) {
            if (!part) {
                continue;
            }
            let child: Entry | undefined;
            if (!(entry instanceof Directory))
                if(!silent)
                    throw FileSystemError.FileNotFound(uri);
                else
                    return undefined;

            child = entry.entries.get(part);
            if (!child) {
                if(create){
                    child = new Directory(part);
                    entry.entries.set(part, child);
                } else if(!silent)
                    throw FileSystemError.FileNotFound(uri);
                else
                    return undefined;
            }
            entry = child;
        }
        return entry;
    }

    private _lookupAsDirectory(uri: Uri, silent: boolean, create?: boolean): Directory {
        const entry = this._lookup(uri, silent, create);
        if (entry instanceof Directory) {
            return entry;
        }
        throw FileSystemError.FileNotADirectory(uri);
    }

    private _lookupAsFile(uri: Uri, silent: boolean): File {
        const entry = this._lookup(uri, silent);
        if (entry instanceof File) {
            return entry;
        }
        throw FileSystemError.FileIsADirectory(uri);
    }

    private _lookupParentDirectory(uri: Uri, create?: boolean): Directory {
        const dirname = uri.with({ path: path.posix.dirname(uri.path) });
        return this._lookupAsDirectory(dirname, false, create);
    }

    // --- manage file events

    private _emitter = new EventEmitter<FileChangeEvent[]>();
    private _bufferedEvents: FileChangeEvent[] = [];
    private _fireSoonHandle?: NodeJS.Timer;

    readonly onDidChangeFile: Event<FileChangeEvent[]> = this._emitter.event;

    watch(_resource: Uri): Disposable {
        // ignore, fires for all changes...
        return new Disposable(() => { });
    }

    private _fireSoon(...events: FileChangeEvent[]): void {
        this._bufferedEvents.push(...events);

        if (this._fireSoonHandle) {
            clearTimeout(this._fireSoonHandle);
        }

        this._fireSoonHandle = setTimeout(() => {
            this._emitter.fire(this._bufferedEvents);
            this._bufferedEvents.length = 0;
        }, 5);
    }
}
