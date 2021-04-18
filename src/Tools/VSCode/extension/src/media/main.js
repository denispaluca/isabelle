(function () {
    const vscode = acquireVsCodeApi();

    const auto_update = document.getElementById('auto_update');
    auto_update.addEventListener('change', (e) => {
        vscode.postMessage({'command': 'auto_update', 'enabled': e.target.value}) ;
    });

    document.getElementById('update_button')
        .addEventListener('click', (e) => {
            vscode.postMessage({'command': 'update'}) 
        });
    console.log('AFADSFDFA');
    document.getElementById('locate_button')
        .addEventListener('click', (e) => {
            vscode.postMessage({'command': 'locate'});
    
            // Send a message back to the extension
            vscode.postMessage({
                command: 'alert',
                text: '🐛  on line ' + currentCount
            });
        })
}());