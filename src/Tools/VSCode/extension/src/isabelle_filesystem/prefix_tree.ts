class TreeNode {
    public key: number | string;
    public parent: TreeNode = null;
    public end: boolean = false;
    public value: number[] | string;
    public children: Record<number | string, TreeNode> = {};
    constructor(key: number | string){
        this.key = key;
    }

    public getWord(): number[] | string[] {
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

    public insert(word: number[] | string, value: number[] | string){
        let node = this.root;
        for(var i = 0; i < word.length; i++) {
            if (!node.children[word[i]]) {
                node.children[word[i]] = new TreeNode(word[i]);
                
                node.children[word[i]].parent = node;
            }
            
            node = node.children[word[i]];
            node.end = false;

            if (i == word.length-1) {
                node.end = true;
                node.value = value;
            }
        }
    }

    public getNode(prefix: number[] | string): TreeNode | undefined {
        let node = this.root;
        
        for(let i = 0; i < prefix.length; i++) {
          if (!node.children[prefix[i]]) {
            return;
          }
          node = node.children[prefix[i]];
        }
        return node;
    }

    public getEndOrValue(prefix: number[] | string): TreeNode | undefined {
        let node = this.root;
        let resNode: TreeNode;
        for(let i = 0; i < prefix.length; i++) {
          if (!node.children[prefix[i]]) {
            return resNode;
          }
          node = node.children[prefix[i]];
          if(node.value){
            resNode = node;
          }

          if(node.end){
            return node;
          }
        }
        return node;
    }
}

export { PrefixTree, TreeNode };