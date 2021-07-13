import { WebviewViewProvider, WebviewView, Uri, WebviewViewResolveContext,
	 CancellationToken, Range, TextEditorRevealType, window, Position, Selection} from "vscode";
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

		webviewView.webview.html = this.content;
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
		}
		
		this._view.webview.html = this._getHtmlForWebview(content);
	}

	private _getHtmlForWebview(content: string): string {
		const webview = this._view.webview;
		const scriptUri = webview.asWebviewUri(Uri.file(path.join(this._extensionUri.fsPath, 'media', 'output.js')));
		const styleVSCodeUri = webview.asWebviewUri(Uri.file(path.join(this._extensionUri.fsPath, 'media', 'vscode.css')));
		return `<!DOCTYPE html>
			<html>
				<head>
					<meta charset="UTF-8">
					<meta name="viewport" content="width=device-width, initial-scale=1.0">
					<link href="${styleVSCodeUri}" rel="stylesheet" type="text/css">
					<style>
					${this._getDecorations()}
					</style>
					<title>Output</title>
				</head>
				<body>
					${content}
					<script src="${scriptUri}"></script>
				</body>
			</html>`;
	}
  
	private _getDecorations(): string{
	  let style: string = '';
	  for(const key of text_colors){
		style += `body.vscode-light .${key} { color: ${library.get_color(key, true)} }\n`;
		style += `body.vscode-dark .${key} { color: ${library.get_color(key, false)} }\n`;
	  }
  
	  return style;
	}
}

export { OutPutViewProvider };