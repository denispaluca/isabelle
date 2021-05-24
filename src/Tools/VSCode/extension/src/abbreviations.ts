import { ExtensionContext, Range, TextDocumentContentChangeEvent, workspace, WorkspaceEdit } from "vscode";
import { SymbolEntry } from "./symbol_encoder";

const entries: Record<string, string> = {};

function registerAbbreviations(data: SymbolEntry[], context: ExtensionContext){
    setAbbrevs(data);
    context.subscriptions.push(
        workspace.onDidChangeTextDocument(e => {
            const doc = e.document;
            if(doc.languageId !== 'isabelle'){
                return;
            }
            const edits = new WorkspaceEdit();

            const changes = e.contentChanges.slice(0);
            changes.sort((c1, c2) => c1.rangeOffset - c2.rangeOffset);

            let c: TextDocumentContentChangeEvent;
            while(c = changes.pop()){
                if(hasSpaceOrReturn(c.text)){
                    return;
                }
                
                const endOffset = c.rangeOffset + c.text.length + 
                    changes.reduce((a,b) => a + b.text.length, 0);

                const endPos = doc.positionAt(endOffset);

                for(const key in entries){
                    const beginOffset = endOffset - key.length;
                    if(beginOffset < 0) {
                        continue;
                    }

                    const beginPos = doc.positionAt(beginOffset);
                    const range = new Range(beginPos, endPos);
                    const compText = doc.getText(range);
                    if(compText === key){
                        edits.replace(doc.uri, range, entries[key]);
                        break;
                    }
                }    
            }

            applyEdits(edits);
        })
    );
}

async function applyEdits(edit: WorkspaceEdit){
    await waitForNextTick();

    await workspace.applyEdit(edit);
}

function setAbbrevs(data: SymbolEntry[]){
    for(const {symbol, code} of data){
        entries[symbol] = String.fromCharCode(code);
    }
}

function hasSpaceOrReturn(text: string){
    return text.includes(' ') || 
        text.includes('\n') || 
        text.includes('\r');
}

function waitForNextTick(): Promise<void> {
	return new Promise((res) => setTimeout(res, 0));
}

export { registerAbbreviations };