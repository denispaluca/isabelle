import { WebviewViewProvider, WebviewView, Uri, WebviewViewResolveContext,
	 CancellationToken, window, Position, Selection, Webview} from "vscode";
import { text_colors } from "./decorations";
import * as library from "./library";
import * as path from 'path';
import { IsabelleFSP } from "./isabelle_filesystem/isabelleFSP";

class OutPutViewProvider implements WebviewViewProvider {

	public static readonly viewType = 'isabelle-output';

	private _view?: WebviewView;
	private content: string = '';

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

		webviewView.webview.html = this._getHtml(this.content);
		webviewView.webview.onDidReceiveMessage(async message => {
			if (message.command === "open") {
				const uri = Uri.parse(message.link);
				const line = Number(uri.fragment) || 0;
				const pos = new Position(line, 0);
				const uriNoFragment = uri.with({ fragment: '' }).toString();
				const isabelleUri = IsabelleFSP.getIsabelleUri(uriNoFragment);
				window.showTextDocument(Uri.parse(isabelleUri), {
					preserveFocus: false,
					selection: new Selection(pos,pos)
				});
			}
		});
	}

	public updateContent(content: string){
		if(!this._view){
			this.content = content;
			return;
		}
		
		this._view.webview.html = this._getHtml(content);
	}

	private _getHtml(content: string): string {
		return getHtmlForWebview(content, this._view.webview, this._extensionUri.fsPath);
	}
}

function getHtmlForWebview(content: string, webview: Webview, extensionPath: string): string {
	const scriptUri = webview.asWebviewUri(Uri.file(path.join(extensionPath, 'media', 'main.js')));
	const styleVSCodeUri = webview.asWebviewUri(Uri.file(path.join(extensionPath, 'media', 'vscode.css')));
	return `<!DOCTYPE html>
		<html>
			<head>
				<meta charset="UTF-8">
				<meta name="viewport" content="width=device-width, initial-scale=1.0">
				<link href="${styleVSCodeUri}" rel="stylesheet" type="text/css">
				<style>
				${_getDecorations()}
				</style>
				<title>Output</title>
			</head>
			<body>
				${content}
				<script src="${scriptUri}"></script>
			</body>
		</html>`;
}

function _getDecorations(): string{
  let style: string = '';
  for(const key of text_colors){
	style += `body.vscode-light .${key} { color: ${library.get_color(key, true)} }\n`;
	style += `body.vscode-dark .${key} { color: ${library.get_color(key, false)} }\n`;
  }

  return style;
}

export { OutPutViewProvider, getHtmlForWebview };