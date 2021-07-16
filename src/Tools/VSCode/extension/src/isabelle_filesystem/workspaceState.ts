import { ExtensionContext } from "vscode";
import { SessionTheories } from "../protocol";
import { SymbolEntry } from "./symbol_encoder";

interface SetupData {
    discFolder: string;
    sessions: SessionTheories[];
    symbolEntries: SymbolEntry[];
}

enum StateKey {
    discFolder = 'discFolder',
    sessions = 'sessions',
    symbolEntries = "symbolEntries"
}

class WorkspaceState {
    constructor(
        private context: ExtensionContext
    ) { }

    public getSetupData(): SetupData {
        return {
            discFolder: this.get(StateKey.discFolder),
            sessions: this.get<SessionTheories[]>(StateKey.sessions),
            symbolEntries: this.get<SymbolEntry[]>(StateKey.symbolEntries)
        }
    }

    public setSetupDate(setupData: SetupData) {
        const {discFolder, sessions } = setupData;
        this.set(StateKey.discFolder, discFolder);
        this.set(StateKey.sessions, sessions)
    }    

    public get<T = string>(key: StateKey): T {
        return this.context.workspaceState.get(key);
    }

    public async set(key: StateKey, value: any) {
        await this.context.workspaceState.update(key, value);
    }
}

export { WorkspaceState, StateKey, SetupData };