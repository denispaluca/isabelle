import { ExtensionContext, Range, TextDocumentContentChangeEvent, workspace, WorkspaceEdit } from "vscode";
import { PrefixTree } from "./isabelle_filesystem/prefix_tree";
import { SymbolEntry } from "./isabelle_filesystem/symbol_encoder";
import { get_replacement_mode } from "./library";

const entries: Record<string, string> = {};
const prefixTree: PrefixTree = new PrefixTree();

function registerAbbreviations(data: SymbolEntry[], context: ExtensionContext){
    const [minLength, maxLength] = setAbbrevs(data);
    const regEx = /[^A-Za-z0-9 ]/;
    context.subscriptions.push(
        workspace.onDidChangeTextDocument(e => {
            const doc = e.document;
            const mode = get_replacement_mode();
            if(
                mode == 'none' ||
                doc.languageId !== 'isabelle' || 
                doc.uri.scheme !== 'isabelle'
            ){
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
                
                if(endOffset < minLength){
                    continue;
                }

                const beginOffset = endOffset < maxLength ? 0 : endOffset - maxLength;

                const endPos = doc.positionAt(endOffset);
                let beginPos = doc.positionAt(beginOffset);
                let range = new Range(beginPos, endPos);
                const text = reverseString(doc.getText(range));
                
                const node = prefixTree.getEndOrValue(text);
                if(!node || !node.value){
                    continue;
                }

                const word = node.getWord().join('');
                if(mode == 'non-alpha' && !regEx.test(word)){
                    continue;
                }

                beginPos = doc.positionAt(endOffset - word.length);
                range = new Range(beginPos, endPos);

                edits.replace(doc.uri, range, node.value as string);
            }

            applyEdits(edits);
        })
    );
}

async function applyEdits(edit: WorkspaceEdit){
    await waitForNextTick();

    await workspace.applyEdit(edit);
}

function getUniqueAbbrevs(data: SymbolEntry[]): Set<string>{
    const unique = new Set<string>();
    const nonUnique = new Set<string>();
    for(const {symbol, code, abbrevs} of data){
        for(const abbrev of abbrevs){
            if(abbrev.length == 1 || nonUnique.has(abbrev)){
                continue;
            }

            if(unique.has(abbrev)){
                nonUnique.add(abbrev);
                unique.delete(abbrev);
                entries[abbrev] = undefined;
                continue;
            }


            entries[abbrev] = String.fromCharCode(code);
            unique.add(abbrev);
        }
    }
    return unique;
}

function setAbbrevs(data: SymbolEntry[]): [number, number]{
    const unique = getUniqueAbbrevs(data);

    //Add white space to abbrevs which are prefix of other abbrevs
    for(const a1 of unique){
        for(const a2 of unique){
            if(a1 == a2){
                continue;
            }

            if(a2.startsWith(a1)){
                const val = entries[a1];
                delete entries[a1];
                entries[a1 + ' '] = val;
                break;
            }
        }
    }

    let minLength: number;
    let maxLength: number;
    for(const entry in entries){
        if(!minLength || minLength > entry.length)
            minLength = entry.length;
        
        if(!maxLength || maxLength< entry.length)
            maxLength = entry.length;
        
        //add reverse because we check the abbrevs from the end
        prefixTree.insert(reverseString(entry), entries[entry]);
    }

    return [minLength, maxLength];
}

function reverseString(str: string): string {
    return str.split('').reverse().join('');
}

function hasNewline(text: string){
    return text.includes('\n') || text.includes('\r');
}

function waitForNextTick(): Promise<void> {
	return new Promise((res) => setTimeout(res, 0));
}

export { registerAbbreviations };