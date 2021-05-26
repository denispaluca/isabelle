class TreeNode {
    public key: number;
    public parent: TreeNode = null;
    public end: boolean = false;
    public children: Record<number, TreeNode> = {};
    constructor(key: number){
        this.key = key;
    }

    public getWord(): number[] {
        let output = [];
        let node: TreeNode = this;
        
        while (node.key !== null) {
          output.unshift(node.key);
          node = node.parent;
        }
        
        return output;
    }
}

class PrefixTree {
    private root: TreeNode;

    constructor(){
        this.root = new TreeNode(null);
    }

    public insert(word: number[]){
        let node = this.root;
        for(var i = 0; i < word.length; i++) {
            if (!node.children[word[i]]) {
                node.children[word[i]] = new TreeNode(word[i]);
                
                node.children[word[i]].parent = node;
            }
            
            node = node.children[word[i]];
            
            if (i == word.length-1) {
                node.end = true;
            }
        }
    }

    public find(prefix: number[]): number[][] {
        let node = this.root;
        let output: number[][] = [];
        
        for(var i = 0; i < prefix.length; i++) {
          if (node.children[prefix[i]]) {
            node = node.children[prefix[i]];
          } else {
            return output;
          }
        }
        
        this.findAllWords(node, output);
        
        return output;
    };
      
    private findAllWords(node: TreeNode, arr: number[][]) {
        if (node.end) {
          arr.unshift(node.getWord());
        }
        
        for (var child in node.children) {
          this.findAllWords(node.children[child], arr);
        }
    }
}

export { PrefixTree };