import { CancellationToken, CustomDocument, CustomDocumentBackup, CustomDocumentBackupContext, 
    CustomDocumentEditEvent, 
    CustomDocumentOpenContext, CustomEditorProvider, Disposable, EventEmitter, ExtensionContext, Uri, 
    WebviewPanel, window, workspace } from "vscode";
import { tmpdir } from 'os';

class IsabelleDocument extends Disposable implements CustomDocument {
    static async create(
        uri: Uri,
        backupId: string | undefined,
    ): Promise<IsabelleDocument | PromiseLike<IsabelleDocument>> {
        // If we have a backup, read that. Otherwise read the resource from the workspace
        const dataFile = typeof backupId === 'string' ? Uri.parse(backupId) : uri;
        const fileData = await IsabelleDocument.readFile(dataFile);
        const newUri = await IsabelleDocument.writeTempFile(uri, fileData);
        return new IsabelleDocument(uri, newUri, fileData);
    }

    private static async readFile(uri: Uri): Promise<Uint8Array> {
        if (uri.scheme === 'untitled') {
            return new Uint8Array();
        }
        return workspace.fs.readFile(uri);
    }

    private static async writeTempFile(uri: Uri, data: Uint8Array): Promise<Uri> {
        const newUri = Uri.joinPath(Uri.parse(tmpdir()), uri.path);
        await workspace.fs.writeFile(newUri, data);
        return newUri;
    }

    public readonly uri: Uri;
    public readonly newUri: Uri;

    public documentData: Uint8Array;

    private constructor(
        uri: Uri,
        newUri: Uri,
        initialContent: Uint8Array
    ) {
        super(() => null);
        this.uri = uri;
        this.newUri = newUri;
        this.documentData = initialContent;
    }
}

export class IsabelleEditorProvider implements CustomEditorProvider<IsabelleDocument> {
	private static readonly viewType = 'isabelle.customEditor';

    public static register(context: ExtensionContext): Disposable {
        return window.registerCustomEditorProvider(
			IsabelleEditorProvider.viewType,
			new IsabelleEditorProvider(context)
        );
    }

	constructor(
		private readonly _context: ExtensionContext
	) { }

    async openCustomDocument(
        uri: Uri,
        openContext: CustomDocumentOpenContext,
        token: CancellationToken): Promise<IsabelleDocument> {
        const doc = await IsabelleDocument.create(uri, openContext.backupId);
        return doc;
    }

    async resolveCustomEditor(
        document: IsabelleDocument,
        webviewPanel: WebviewPanel,
        _token: CancellationToken
    ): Promise<void> {
        const textDocument = await workspace.openTextDocument(document.newUri);
        const editor =  await window.showTextDocument(textDocument, webviewPanel.viewColumn);
    }

    public saveCustomDocument(document: IsabelleDocument, cancellation: CancellationToken): Thenable<void> {
		console.log("Save");
        return;
	}

	public saveCustomDocumentAs(document: IsabelleDocument, destination: Uri, cancellation: CancellationToken): Thenable<void> {
		console.log("Save As");
        return;
	}

	public revertCustomDocument(document: IsabelleDocument, cancellation: CancellationToken): Thenable<void> {
		console.log("Revert");
        return;
	}

	public backupCustomDocument(document: IsabelleDocument, context: CustomDocumentBackupContext, cancellation: CancellationToken): Thenable<CustomDocumentBackup> {
		console.log("Save As");
        return;
	}

    private readonly _onDidChangeCustomDocument = new EventEmitter<CustomDocumentEditEvent<IsabelleDocument>>();
	public readonly onDidChangeCustomDocument = this._onDidChangeCustomDocument.event;
}