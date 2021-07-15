import {
    FileStat, FileType, FileSystemProvider, Uri, FileSystemError, FileChangeType,
    FileChangeEvent, Event, Disposable, EventEmitter, ExtensionContext, workspace,
    TextDocument, commands, window, ViewColumn, languages
} from "vscode";
import * as path from 'path';
import { SymbolEncoder, SymbolEntry } from "./symbol_encoder";
import { SessionTheories } from "../protocol";
import { WorkspaceState, StateKey } from "./workspaceState";

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
    private static state: WorkspaceState;

    public static async register(context: ExtensionContext): Promise<string> {
        this.instance = new IsabelleFSP();
        this.state = new WorkspaceState(context);
        context.subscriptions.push(
            workspace.registerFileSystemProvider(
                this.scheme,
                this.instance
            ),

            workspace.onDidOpenTextDocument((d) => {
                if (d.uri.scheme === this.scheme) {
                    this.instance.prepareTheory(d);
                    return;
                }
                this.instance.decideToCreate(d.uri, d.languageId);
            }),

            window.onDidChangeActiveTextEditor(async editor => {
                if(!editor) return;

                const document = editor.document;
                const newUri = await this.instance.decideToCreate(document.uri, document.languageId);

                if (!newUri) return;
                
                const answer = await window.showInformationMessage(
                    'Would you like to open the Isabelle theory associated with this file?',
                    'Yes',
                    'No'
                )

                if (answer !== 'Yes') {
                    return;
                }

                await commands.executeCommand('workbench.action.closeActiveEditor');
                await commands.executeCommand('vscode.open', Uri.parse(newUri), ViewColumn.Active);
            }),

            this.instance.syncFromOriginal(),

            commands.registerCommand('isabelle.reload-workspace',
                () => this.instance.reloadWorkspace()),

            commands.registerTextEditorCommand(
                'isabelle.reload-file',
                (e) => {
                    const fileUri = this.getFileUri(e.document.uri.toString());
                    this.instance.reloadFile(Uri.parse(fileUri));
                }
            )
        );

        return await this.instance.setupWorkspace();
    }

    public static updateSymbolEncoder(entries: SymbolEntry[]) {
        this.symbolEncoder = new SymbolEncoder(entries);
        this.state.set(StateKey.symbolEntries, entries);
    }

    public static getFileUri(isabelleUri: string): string {
        return this.instance.isabelleToFile.get(isabelleUri) || isabelleUri;
    }

    public static getIsabelleUri(fileUri: string): string {
        return this.instance.fileToIsabelle.get(Uri.parse(fileUri).toString()) || fileUri;
    }

    public static initWorkspace(sessions: SessionTheories[]) {
        this.instance.init(sessions);
    }

    //#endregion


    private root = new Directory('');
    private isabelleToFile = new Map<string, string>();
    private fileToIsabelle = new Map<string, string>();
    private sessionTheories: SessionTheories[] = [];

    private async setupWorkspace(): Promise<string> {
        const { state } = IsabelleFSP;
        let { sessions, discFolder, symbolEntries} = state.getSetupData();
        const mainFolderUri = Uri.parse(`${IsabelleFSP.scheme}:/`);

        if(workspace.workspaceFolders[0].uri.toString() !== mainFolderUri.toString()){
            workspace.updateWorkspaceFolders(0, 0,
                {
                    uri: mainFolderUri,
                    name: "Isabelle - Theories"
                }
            );
        }
        
        if(sessions && discFolder && symbolEntries){
            IsabelleFSP.updateSymbolEncoder(symbolEntries);
            await this.init(sessions);
            return discFolder;
        }
        
        
        discFolder = workspace.workspaceFolders[1].uri.fsPath;
        state.set(StateKey.discFolder, discFolder);
        return discFolder;
    }

    private syncFromOriginal(): Disposable {
        const watcher = workspace.createFileSystemWatcher("**/*.thy");
        watcher.onDidChange(uri => this.reloadFile(uri));
        watcher.onDidDelete(uri => {
            const isabelleFile = this.fileToIsabelle.get(uri.toString());
            if (!isabelleFile) {
                return;
            }
            this._delete(Uri.parse(isabelleFile));
        });
        watcher.onDidCreate(uri => this.decideToCreate(uri, 'isabelle'));

        return watcher;
    }

    private async prepareTheory(doc: TextDocument) {
        if(doc.languageId !== 'isabelle')
            languages.setTextDocumentLanguage(doc, 'isabelle');
        
        const uriString = doc.uri.toString();
        const file = this.isabelleToFile.get(uriString);
        if (!file) {
            return;
        }

        const found = (await workspace.findFiles('**/*.thy'))
            .find(uri => uri.toString() === file);
        if (!found) {
            window.showWarningMessage('Theory may or may not be synced with disc file!');
        }
    }

    private syncDeletion(uri: Uri) {
        const isabelleFile = uri.toString();
        const file = this.isabelleToFile.get(isabelleFile);
        this.isabelleToFile.delete(isabelleFile);
        this.fileToIsabelle.delete(file);
    }


    private async reloadFile(fileUri: Uri) {
        const isabelleFile = this.fileToIsabelle.get(fileUri.toString());
        if (!isabelleFile) {
            return;
        }

        const data = await workspace.fs.readFile(fileUri);
        const encodedData = IsabelleFSP.symbolEncoder.encode(data);
        const isabelleUri = Uri.parse(isabelleFile);
        this.writeFile(isabelleUri, encodedData, { create: false, overwrite: true });
    }

    private reloadWorkspace() {
        this.init(this.sessionTheories);
    }

    private resetWorkspace() {
        for(const key of this.root.entries.keys()){
            if(key === 'Draft') continue;

            this._delete(Uri.parse(`${IsabelleFSP.scheme}:/${key}`), true);
        }

        this.sessionTheories = this.sessionTheories.filter(v => v.session_name === 'Draft');
    }

    private async init(sessions: SessionTheories[]) {
        this.resetWorkspace();
        this.sessionTheories.push(...sessions.map(({ session_name, theories }) => ({
            session_name,
            theories: theories.map(t => Uri.parse(t).toString())
        })));
        IsabelleFSP.state.set(StateKey.sessions, this.sessionTheories);

        for (const { session_name } of this.sessionTheories) {
            if (!session_name) continue;
            this._createDirectory(Uri.parse(`${IsabelleFSP.scheme}:/${session_name}`));
        }

        const promises = this.sessionTheories.map(
            ({ session_name, theories }) => theories.map(
                s => this.createFromOriginal(Uri.parse(s), session_name)
            )
        ).reduce((x, y) => x.concat(y), []);

        await Promise.all(promises);
    }

    public async createFromOriginal(uri: Uri, sessionName: string): Promise<Uri> {
        const data = await workspace.fs.readFile(uri);

        const newUri = Uri.parse(
            IsabelleFSP.scheme + ':' +
            path.posix.join('/', sessionName, path.basename(uri.fsPath, '.thy'))
        );
        const encodedData = IsabelleFSP.symbolEncoder.encode(data);

        const isabelleFile = newUri.toString();
        const discFile = uri.toString();
        this.isabelleToFile.set(isabelleFile, discFile);
        this.fileToIsabelle.set(discFile, isabelleFile);

        await this.writeFile(newUri, encodedData, { create: true, overwrite: true });

        return newUri;
    }

    public getTheorySession(uri: string): string {
        let session = this.sessionTheories.find((s) => s.theories.includes(uri));
        if (!session) {
            if(!this.root.entries.get('Draft')){
                this._createDirectory(Uri.parse(IsabelleFSP.scheme + ':/Draft'));
                this.sessionTheories.push({
                    session_name: 'Draft',
                    theories: []
                });
            }

            session = this.sessionTheories.find((s) => s.session_name === 'Draft');
            session.theories.push(uri);
            IsabelleFSP.state.set(StateKey.sessions, this.sessionTheories);
        }

        return session.session_name;
    }

    public async decideToCreate(uri: Uri, languageId: string): Promise<string | undefined> {
        if (
            uri.scheme !== 'file' ||
            languageId !== 'isabelle' ||
            !IsabelleFSP.symbolEncoder
        ) {
            return;
        }

        const uriString = uri.toString();
        const isabelleUri = this.fileToIsabelle.get(uriString);
        if (isabelleUri) {
            return isabelleUri;
        }

        const session = this.getTheorySession(uriString);
        const createdUri = await this.createFromOriginal(uri, session);

        return createdUri.toString();
    }

    private async syncOriginal(uri: Uri, content: Uint8Array) {
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
        if (!IsabelleFSP.symbolEncoder) return;
        if (!this.isabelleToFile.get(uri.toString())) {
            throw FileSystemError.NoPermissions("No permission to create on Isabelle File System");
        }

        const basename = path.posix.basename(uri.path);
        const [parent, parentUri] = this._getParentData(uri);
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

        if (entry) {
            if (options.create) {
                this.syncOriginal(uri, content);
                return;
            }

            entry.mtime = Date.now();
            entry.size = content.byteLength;
            entry.data = content;

            this._fireSoon({ type: FileChangeType.Changed, uri });
            return;
        }

        entry = new File(basename);
        entry.mtime = Date.now();
        entry.size = content.byteLength;
        entry.data = content;

        parent.entries.set(basename, entry);
        parent.mtime = Date.now();
        parent.size++;
        this._fireSoon(
            { type: FileChangeType.Changed, uri: parentUri }, 
            { type: FileChangeType.Created, uri }
        );
    }

    // --- manage files/folders

    rename(oldUri: Uri, newUri: Uri, options: { overwrite: boolean }): void {
        throw FileSystemError.NoPermissions("No permission to rename on Isabelle File System");
    }

    private _delete(uri: Uri, silent: boolean = false): void {
        const dirname = uri.with({ path: path.posix.dirname(uri.path) });
        const basename = path.posix.basename(uri.path);
        const parent = this._lookupAsDirectory(dirname, silent);
        
        if(!parent) return;
        if (!parent.entries.has(basename)) {
            if(!silent)
                throw FileSystemError.FileNotFound(uri);
            else 
                return;
        }
        parent.entries.delete(basename);
        parent.mtime = Date.now();
        parent.size -= 1;

        this.syncDeletion(uri);

        this._fireSoon({ type: FileChangeType.Changed, uri: dirname }, { uri, type: FileChangeType.Deleted });
    }

    delete(uri: Uri): void {
        const [parent, parentUri] = this._getParentData(uri)
        if(parent && parent.name === 'Draft'){
            this._delete(uri);
            if(parent.size === 0){
                this._delete(parentUri);
            }
            return;
        }

        throw FileSystemError.NoPermissions("No permission to delete on Isabelle File System");
        //In case it needs to be reactivated
        this._delete(uri);
    }

    private _createDirectory(uri: Uri): void {
        const basename = path.posix.basename(uri.path);
        const [parent, parentUri] = this._getParentData(uri);

        const entry = new Directory(basename);
        parent.entries.set(entry.name, entry);
        parent.mtime = Date.now();
        parent.size += 1;
        this._fireSoon(
            { type: FileChangeType.Changed, uri: parentUri }, 
            { type: FileChangeType.Created, uri }
        );
    }

    createDirectory(uri: Uri): void {
        throw FileSystemError.NoPermissions("No permission to create on Isabelle File System");
        //In case it needs to be reactivated
        this._createDirectory(uri);
    }

    private _getParentData(uri: Uri): [Directory, Uri] {
        const parentUri = uri.with({ path: path.posix.dirname(uri.path) });
        const parent = this._lookupAsDirectory(parentUri, false);

        return [parent, parentUri];
    }

    // --- lookup

    private _lookup(uri: Uri, silent: false): Entry;
    private _lookup(uri: Uri, silent: boolean): Entry | undefined;
    private _lookup(uri: Uri, silent: boolean): Entry | undefined {
        const parts = uri.path.split('/');
        let entry: Entry = this.root;
        for (const part of parts) {
            if (!part) {
                continue;
            }
            let child: Entry | undefined;
            if (entry instanceof Directory) {
                child = entry.entries.get(part);
            }
            if (!child) {
                if (!silent) {
                    throw FileSystemError.FileNotFound(uri);
                } else {
                    return undefined;
                }
            }
            entry = child;
        }
        return entry;
    }

    private _lookupAsDirectory(uri: Uri, silent: boolean): Directory {
        const entry = this._lookup(uri, silent);
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

    private _lookupParentDirectory(uri: Uri): Directory {
        const dirname = uri.with({ path: path.posix.dirname(uri.path) });
        return this._lookupAsDirectory(dirname, false);
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
