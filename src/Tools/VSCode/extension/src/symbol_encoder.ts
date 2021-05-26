import { TextEncoder } from 'util';
import { window } from 'vscode';
import { PrefixTree } from './prefix_tree';

interface SlicePos {
    length: number;
    replacementIndex: number;
}

export interface SymbolEntry
{
  symbol: string,
  name: string,
  code: number
}

class EncodeData {
    indexMap: Map<number, Uint8Array>;
    prefixTree: PrefixTree;
    minLength: number;
    maxLength: number;

    constructor(data: Uint8Array[]){
        this.indexMap = new Map();
        this.prefixTree = new PrefixTree();

        let i: number = 0;
        for(const entry of data){
            if(!this.minLength || this.minLength > entry.length)
                this.minLength = entry.length;
            
            if(!this.maxLength || this.maxLength< entry.length)
                this.maxLength = entry.length;

            this.indexMap.set(i, entry);
            this.prefixTree.insert(Array.from(entry))
            i++;
        }
    }

    public getKey(word: number[]): number | undefined{
        const w = new Uint8Array(word);
        return [...this.indexMap.entries()]
            .filter(({ 1: v }) => EncodeData.areEqual(v, w))
            .map(([k]) => k)
            .pop();
    }

    private static areEqual(w1: Uint8Array, w2: Uint8Array): boolean{
        if(w1.length !== w2.length) return false;

        for(let i = 0; i < w1.length; i++){
            if(w1[i] !== w2[i]) return false;
        }
        return true;
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
        this.symbols = new EncodeData(syms);
        this.sequences = new EncodeData(seqs);
    }

    encode(content: Uint8Array): Uint8Array{
        return this.code3(content, this.sequences, this.symbols);
    }

    decode(content: Uint8Array): Uint8Array{
        return this.code3(content, this.symbols, this.sequences);
    }

    private code3(content: Uint8Array, origin: EncodeData, replacements: EncodeData): Uint8Array {
        const result: number[] = [];
        for(let i = 0; i < content.length; i++){
            if(i > content.length - origin.minLength){
                result.push(content[i]);
                continue;
            }

            let word = [content[i]];
            let matches: number[][];
            let found = false;
            for(let j = i + 1; j < i + origin.maxLength; j++){
                matches = origin.prefixTree.find(word);
                if(matches.length == 0) break;
                if(matches.length == 1 && word.length == matches[0].length){
                    found = true;
                    break;
                }

                word.push(content[j]);
            }
            
            if(found){
                result.push(...Array.from(replacements.indexMap.get(origin.getKey(word))));
                i += word.length - 1;
                continue;
            }
            result.push(content[i]);
        }

        return new Uint8Array(result);
    }

    private code2(content: Uint8Array, origin: EncodeData, replacements: EncodeData): Uint8Array {
        for(const [key, val] of origin.indexMap.entries()){
            let newContent: number[] = [];
            const replacement = Array.from(replacements.indexMap.get(key));
            let i: number;
            for(i = 0; i < content.length - val.length; i++){
                let isCorrect = true;
                let j: number;
                for(j = 0; j < val.length; j++){
                    if(val[j] !== content[i+j]){
                        isCorrect = false;
                        break;
                    }
                }

                if(isCorrect){
                    newContent.push(...replacement);
                    i += j - 1;
                    continue;
                }
                newContent.push(content[i]);
            }

            for(;i < content.length; i++)
                newContent.push(content[i]);
            
            content = new Uint8Array(newContent);
        }

        return content;
    }

    private code(content: Uint8Array, origin: EncodeData, replacements: EncodeData): Uint8Array {
        for(let i = 0; i < content.byteLength - origin.minLength; i++){
            const decision = this.decisionTree(content, i, origin);
            
            if(decision === undefined) continue;
            
            const replacement = replacements.indexMap.get(decision.replacementIndex);
            if(!replacement) continue;

            let newContent = new Uint8Array(content.length - decision.length + replacement.length);
            newContent.set(content.slice(0, i));
            newContent.set(replacement, i);
            newContent.set(content.slice(i+decision.length, content.length), i + replacement.length);

            content = newContent;
        }

        return content;
    }

    private decisionTree(
        content: Uint8Array, 
        i: number, 
        origin: EncodeData
        ): SlicePos | undefined {

        let originMap = new Map(origin.indexMap);
        for(let j = 0; j < origin.maxLength; j++){
            let valid = new Map<number, Uint8Array>();
            for(const [key, val] of originMap.entries()){
                if(val[j] !== content[i + j]) 
                    continue;
                
                if(j == val.byteLength - 1) 
                    return {
                        length: j + 1,
                        replacementIndex: key
                    };
                
                valid.set(key, val);
            }

            if(!valid || valid.size === 0) return;
            originMap = valid;
        }

        return;
    }
}