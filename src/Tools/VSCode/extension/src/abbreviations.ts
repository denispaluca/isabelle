import { ExtensionContext, Range, TextDocumentContentChangeEvent, workspace, WorkspaceEdit } from "vscode";
import { SymbolEntry } from "./isabelle_filesystem/symbol_encoder";

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
                if(c.rangeLength === 1 || hasNewline(c.text)){
                    return;
                }
                
                const endOffset = c.rangeOffset + c.text.length + 
                    changes.reduce((a,b) => a + b.text.length, 0);

                const endPos = doc.positionAt(endOffset);

                let longestMatch: string;
                let range: Range;
                for(const key in entries){
                    const beginOffset = endOffset - key.length;
                    if(beginOffset < 0 || 
                        (longestMatch && longestMatch.length >= key.length)) {
                        continue;
                    }

                    const beginPos = doc.positionAt(beginOffset);
                    const tempRange = new Range(beginPos, endPos);
                    const compText = doc.getText(tempRange);
                    if(compText === key){
                        longestMatch = compText;
                        range = tempRange;
                    }
                }    
                edits.replace(doc.uri, range, entries[longestMatch]);
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
    const customAbbrevs = new Set<string>();
    for(const {symbol, code, abbrevs} of data){
        entries[symbol] = String.fromCharCode(code);
        for(const abbrev of abbrevs){
            entries[abbrev] = String.fromCharCode(code);
            customAbbrevs.add(abbrev);
        }
    }

    //Add white space to abbrevs which are shorter versions 
    //of longer abbrevs
    for(const a1 of customAbbrevs.values()){
        for(const a2 of customAbbrevs.values()){
            if(a1 == a2){
                continue;
            }

            if(a2.includes(a1)){
                const val = entries[a1];
                delete entries[a1];
                entries[a1 + ' '] = val;
                break;
            }
        }
    }
}

function hasNewline(text: string){
    return text.includes('\n') || text.includes('\r');
}

function waitForNextTick(): Promise<void> {
	return new Promise((res) => setTimeout(res, 0));
}

export { registerAbbreviations };