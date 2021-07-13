import { DecorationRangeBehavior, DecorationRenderOptions, ExtensionContext, Range, TextEditorDecorationType, window, workspace } from "vscode";
 
function indicesOf(char: string, text: string): number[]{
    let indices: number[] = [];
    for(let i = 0; i < text.length - 1; i++) {
        if (text[i] === char && 
            text[i + 1] !== ' ' && 
            text[i + 1] !== char) {
            
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

    context.subscriptions.push(
        hide, superscript, subscript,
        window.onDidChangeActiveTextEditor(editor => {
            const doc = editor.document;
            const text = doc.getText();
            const superscriptIndices = indicesOf('⇧', text);
            const subscriptIndices = indicesOf('⇩', text);

            const hideRanges: Range[] = [];
            const superscriptRanges: Range[] = [];
            const subscriptRanges: Range[] = [];

            for(const index of superscriptIndices){
                const posMid = doc.positionAt(index + 1);
                hideRanges.push(new Range(doc.positionAt(index), posMid));
                superscriptRanges.push(new Range(posMid, doc.positionAt(index + 2)));
            }

            for(const index of subscriptIndices){
                const posMid = doc.positionAt(index + 1);
                hideRanges.push(new Range(doc.positionAt(index), posMid));
                subscriptRanges.push(new Range(posMid, doc.positionAt(index + 2)));
            }

            editor.setDecorations(hide, hideRanges);
            editor.setDecorations(superscript, superscriptRanges);
            editor.setDecorations(subscript, subscriptRanges);
        })    
    );

    
}