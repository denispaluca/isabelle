class TreeNode {
    public key: number;
    public parent: TreeNode = null;
    public end: boolean = false;
    public value: number[];
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

    public insert(word: number[], value: number[]){
        let node = this.root;
        for(var i = 0; i < word.length; i++) {
            if (!node.children[word[i]]) {
                node.children[word[i]] = new TreeNode(word[i]);
                
                node.children[word[i]].parent = node;
            }
            
            node = node.children[word[i]];
            
            if (i == word.length-1) {
                node.end = true;
                node.value = value;
            }
        }
    }

    public check(prefix: number[]): boolean {
        return !!this.getNode(prefix);
    }

    public contains(word: number[]): boolean {
        let node = this.getNode(word);
        if(!node){
            return false;
        }

        return node.end;
    }

    public getNode(prefix: number[]): TreeNode | undefined {
        let node = this.root;
        
        for(let i = 0; i < prefix.length; i++) {
          if (!node.children[prefix[i]]) {
            return;
          }
          node = node.children[prefix[i]];
        }
        return node;
    }

    public find(prefix: number[]): number[][] {
        let node = this.root;
        let output: number[][] = [];
        
        node = this.getNode(prefix);
        if(!node){
            return output;
        }
        
        this.findAllWords(node, output);
        
        return output;
    };
      
    private findAllWords(node: TreeNode, arr: number[][]) {
        if (node.end) {
          arr.unshift(node.getWord());
        }
        
        for (let child in node.children) {
          this.findAllWords(node.children[child], arr);
        }
    }
}

export { PrefixTree, TreeNode };