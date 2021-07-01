import { TextEncoder } from 'util';
import { PrefixTree, TreeNode } from './prefix_tree';

export interface SymbolEntry
{
  symbol: string,
  name: string,
  code: number,
  abbrevs: string[]
}

class EncodeData {
    prefixTree: PrefixTree;
    minLength: number;
    maxLength: number;

    constructor(origin: Uint8Array[], replacement: Uint8Array[]){
        this.prefixTree = new PrefixTree();

        for(let i = 0; i < origin.length; i++){
            const entry = origin[i];
            if(!this.minLength || this.minLength > entry.length)
                this.minLength = entry.length;
            
            if(!this.maxLength || this.maxLength< entry.length)
                this.maxLength = entry.length;

            this.prefixTree.insert(Array.from(entry), Array.from(replacement[i]));
        }
    }
}

export class SymbolEncoder {
    private symbols: EncodeData;
    private sequences: EncodeData;

    constructor(entries: SymbolEntry[]){
        let syms: Uint8Array[] = [];
        let seqs: Uint8Array[] = [];
        const encoder = new TextEncoder();
        for(const {symbol, code} of entries) {
            seqs.push(encoder.encode(symbol));
            syms.push(encoder.encode(String.fromCharCode(code)))
        }
        this.symbols = new EncodeData(syms, seqs);
        this.sequences = new EncodeData(seqs, syms);
    }

    encode(content: Uint8Array): Uint8Array{
        return this.code(content, this.sequences, this.symbols);
    }

    decode(content: Uint8Array): Uint8Array{
        return this.code(content, this.symbols, this.sequences);
    }

    private code(content: Uint8Array, origin: EncodeData, replacements: EncodeData): Uint8Array {
        const result: number[] = [];

        for(let i = 0; i < content.length; i++){
            if(i > content.length - origin.minLength){
                result.push(content[i]);
                continue;
            }

            let word: number[] = [];
            let node: TreeNode;
            for(let j = i; j < i + origin.maxLength; j++){
                word.push(content[j]);
                node = origin.prefixTree.getNode(word);
                if(!node || node.end){
                    break;
                }
            }
            
            if(node && node.end){
                result.push(...(node.value as number[]));
                i += word.length - 1;
                continue;
            }
            result.push(content[i]);
        }

        return new Uint8Array(result);
    }
}