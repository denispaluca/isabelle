import { DecorationRangeBehavior, ExtensionContext, Range, 
    TextDocument, TextEditor, window, workspace } from "vscode";
 
const arrows = {
    sub: '⇩',
    super: '⇧',
    subBegin: '⇘',
    subEnd: '⇙',
    superBegin: '⇗',
    superEnd: '⇖'
}
const noHideList = [' ', '\n', '\r', ...Object.values(arrows)];

function shouldHide(nextChar: string): boolean{
    return !noHideList.includes(nextChar);
}

function findClosing(close: string, text: string, openIndex: number): number | undefined {
    let closeIndex = openIndex;
    let counter = 1;
    const open = text[openIndex];
    while (counter > 0) {
        let c = text[++closeIndex];

        if(c === undefined) return;

        if (c === open) {
            counter++;
        }
        else if (c === close) {
            counter--;
        }
    }
    return closeIndex;
}



function extractRanges(doc: TextDocument) {
    const text = doc.getText();
    const hideRanges: Range[] = [];
    const superscriptRanges: Range[] = [];
    const subscriptRanges: Range[] = [];

    for(let i = 0; i < text.length - 1; i++) {
        switch (text[i]) {
            case arrows.super:
            case arrows.sub:
                if(shouldHide(text[i + 1])){
                    const posMid = doc.positionAt(i + 1);
                    hideRanges.push(new Range(doc.positionAt(i), posMid));
                    (text[i] === arrows.sub ? subscriptRanges : superscriptRanges)
                        .push(new Range(posMid, doc.positionAt(i + 2)));
                    i++;
                }
                break;
            case arrows.superBegin:
            case arrows.subBegin:
                const close = text[i] === arrows.subBegin ? arrows.subEnd : arrows.superEnd;
                const scriptRanges = text[i] === arrows.subBegin ? subscriptRanges : superscriptRanges;
                const closeIndex = findClosing(close, text, i);
                if(closeIndex && closeIndex - i > 1){
                    const posStart = doc.positionAt(i + 1);
                    const posEnd = doc.positionAt(closeIndex);
                    hideRanges.push(
                        new Range(doc.positionAt(i), posStart),
                        new Range(posEnd, doc.positionAt(closeIndex + 1))
                    );
                    scriptRanges.push(new Range(posStart, posEnd));
                    i = closeIndex;
                }
                break;
            default:
                break;
        }
    }

    return { hideRanges, superscriptRanges, subscriptRanges };
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