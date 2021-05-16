import { TextEncoder } from 'util';

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
    minLength: number;
    maxLength: number;

    constructor(data: Uint8Array[]){
        this.indexMap = new Map();


        let i: number = 0;
        for(const entry of data){
            if(!this.minLength || this.minLength > entry.length)
                this.minLength = entry.length;
            
            if(!this.maxLength || this.maxLength< entry.length)
                this.maxLength = entry.length;

            this.indexMap.set(i, entry);
            i++;
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
        this.symbols = new EncodeData(syms);
        this.sequences = new EncodeData(seqs);
    }

    encode(content: Uint8Array): Uint8Array{
        return this.code(content, this.sequences, this.symbols);
    }

    decode(content: Uint8Array): Uint8Array{
        return this.code(content, this.symbols, this.sequences);
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