(function () {
    const vscode = acquireVsCodeApi();
    
    for (const link of document.querySelectorAll('a')) {
        link.addEventListener('click', () => {
            vscode.postMessage({
                command: "open",
                link: link.getAttribute('href'),
            });
        });
    }
}());