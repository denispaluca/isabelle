import { DecorationRangeBehavior, ExtensionContext, Range, 
    TextDocument, TextEditor, window, workspace } from "vscode";
 
const noHideList = [' ', '\n', '\r', '⇩', '⇧'];
function indicesOf(char: string, text: string): number[]{
    let indices: number[] = [];
    for(let i = 0; i < text.length - 1; i++) {
        if (text[i] === char && !noHideList.includes(text[i + 1])) {
            indices.push(i);
        }
    }

    return indices;
}

export function registerScriptDecorations(context: ExtensionContext){
    const hide = window.createTextEditorDecorationType({
      textDecoration: 'none; font-size: 0.001em',
      rangeBehavior: DecorationRangeBehavior.ClosedClosed
    });

    const superscript = window.createTextEditorDecorationType({
        //textDecoration: 'none; vertical-align: super; font-size: .83em'
        textDecoration: 'none; position: relative; top: -0.5em; font-size: 80%'
    });

    const subscript = window.createTextEditorDecorationType({
        //textDecoration: 'none; vertical-align: sub; font-size: .83em'
        textDecoration: 'none; position: relative; bottom: -0.5em; font-size: 80%'
    });

    const setEditorDecs = (editor: TextEditor, doc: TextDocument) => {
        const { hideRanges, superscriptRanges, subscriptRanges } = extractRanges(doc);

        editor.setDecorations(hide, hideRanges);
        editor.setDecorations(superscript, superscriptRanges);
        editor.setDecorations(subscript, subscriptRanges);
    }

    context.subscriptions.push(
        hide, superscript, subscript,

        window.onDidChangeActiveTextEditor(editor => {
            if(!editor){
                return;
            }

            const doc = editor.document;
            setEditorDecs(editor, doc);
        }),
        
        workspace.onDidChangeTextDocument(({document}) => {
            for(const editor of window.visibleTextEditors){
                if(editor.document.uri.toString() === document.uri.toString()){
                    setEditorDecs(editor, document);
                }
            }
        })
    );
}

function extractRanges(doc: TextDocument) {
    const text = doc.getText();
    const superscriptIndices = indicesOf('⇧', text);
    const subscriptIndices = indicesOf('⇩', text);

    const hideRanges: Range[] = [];
    const superscriptRanges: Range[] = [];
    const subscriptRanges: Range[] = [];

    for (const index of superscriptIndices) {
        const posMid = doc.positionAt(index + 1);
        hideRanges.push(new Range(doc.positionAt(index), posMid));
        superscriptRanges.push(new Range(posMid, doc.positionAt(index + 2)));
    }

    for (const index of subscriptIndices) {
        const posMid = doc.positionAt(index + 1);
        hideRanges.push(new Range(doc.positionAt(index), posMid));
        subscriptRanges.push(new Range(posMid, doc.positionAt(index + 2)));
    }
    return { hideRanges, superscriptRanges, subscriptRanges };
}
