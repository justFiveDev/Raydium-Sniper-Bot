import { PublicKey } from "@solana/web3.js";

export const RAYDIUM_CPMM_PROGRAM_ID = new PublicKey(
  "CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C"
);

export const CPMM_CONFIG_ID = new PublicKey(
  "D4FPEruKEHrG5TenZ2mpDGEfu1iUvTiqBxvpU8HLBvC2"
);

export const WSOL_MINT = new PublicKey(
  "So11111111111111111111111111111111111111112"
);

export interface Meta {
  err: null | string;
  fee: string;
  preBalances: string[];
  postBalances: string[];
  preTokenBalances: TokenBalance[];
  postTokenBalances: TokenBalance[];
  logMessages: string[];
  loadedAddresses: {
    writable: string[];
    readonly: string[];
  };
  innerInstructions: InnerInstruction[];
}

interface TokenBalance {
  accountIndex: number;
  mint: string;
  uiTokenAmount: {
    uiAmount: number;
    decimals: number;
    amount: string;
    uiAmountString: string;
  };
  owner: string;
  programId: string;
}

interface InnerInstruction {
  name?: string;
  programId: string;
  parentProgramId?: string;
  accounts: {
    name?: string;
    isSigner: boolean;
    isWritable: boolean;
    pubkey: string;
  }[];
  args: any;
}

export interface Transaction {
  signatures: string[];
  message: {
    header: any,
    accountKeys: string[];
    recentBlockhash: string;
    instructions: {
      programIdIndex: number;
      accounts: number[];
      data: string;
    }[];
    compiledInstructions: {
      name: string;
      accounts: {
        name: string;
        isSigner: boolean;
        isWritable: boolean;
        pubkey: string;
      }[];
      args: Record<string, any>;
      programId: string;
    }[];
  };
}
