(function () {
    const vscode = acquireVsCodeApi();

    const auto_update = document.getElementById('auto_update');
    auto_update.addEventListener('change', (e) => {
        vscode.postMessage({'command': 'auto_update', 'enabled': e.target.checked}) ;
    });

    document.getElementById('update_button')
        .addEventListener('click', (e) => {
            vscode.postMessage({'command': 'update'}) 
        });
        
    document.getElementById('locate_button')
        .addEventListener('click', (e) => {
            vscode.postMessage({'command': 'locate'});
        });
    
    for (const link of document.querySelectorAll('a')) {
        link.addEventListener('click', () => {
            vscode.postMessage({
                command: "open",
                link: link.getAttribute('href'),
            });
        });
    }
}());