import { WebviewViewProvider, WebviewView, Uri, WebviewViewResolveContext,
	 CancellationToken } from "vscode";

class OutPutViewProvider implements WebviewViewProvider {

	public static readonly viewType = 'isabelle-output';

	private _view?: WebviewView;

	constructor(
		private readonly _extensionUri: Uri,
	) { }

	public resolveWebviewView(
		webviewView: WebviewView,
		context: WebviewViewResolveContext,
		_token: CancellationToken,
	) {
		this._view = webviewView;

		webviewView.webview.options = {
			// Allow scripts in the webview
			enableScripts: true,

			localResourceRoots: [
				this._extensionUri
			]
		};

		webviewView.webview.html = '';
	}

	public updateHtml(html: string){
		this._view.webview.html = html;
	}
}

export { OutPutViewProvider };