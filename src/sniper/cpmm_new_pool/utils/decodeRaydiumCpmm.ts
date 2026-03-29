import { SolanaParser } from "@shyft-to/solana-transaction-parser";
import { PublicKey, VersionedTransactionResponse } from "@solana/web3.js";
import { RAYDIUM_CPMM_PROGRAM_ID } from "../constants";
import { RAYDIUM_CPMM_IDL } from "../idls/raydiumCpmmIdl";
import { Idl } from "@coral-xyz/anchor";
import bnLayoutFormatter from "./bn-layout-formatter";
import logger from "../../../logger";

const RAYDIUM_CPMM_IX_PARSER = new SolanaParser([]);
RAYDIUM_CPMM_IX_PARSER.addParserFromIdl(
  RAYDIUM_CPMM_PROGRAM_ID.toBase58(),
  RAYDIUM_CPMM_IDL as Idl
);

const decodeRaydiumCpmm = (tx: VersionedTransactionResponse) => {
  try {
    if (!tx.meta || tx.meta?.err) return;

    const paredIxs = RAYDIUM_CPMM_IX_PARSER.parseTransactionData(
      tx.transaction.message,
      tx.meta.loadedAddresses
    );

    const raydium_cpmm_Ixs = paredIxs.filter(
      (ix) =>
        ix.programId.equals(RAYDIUM_CPMM_PROGRAM_ID) ||
        ix.programId.equals(
          new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA")
        )
    );

    const parsedInnerIxs =
      RAYDIUM_CPMM_IX_PARSER.parseTransactionWithInnerInstructions(tx);

    const raydium_cpmm_inner_ixs = parsedInnerIxs.filter(
      (ix) =>
        ix.programId.equals(RAYDIUM_CPMM_PROGRAM_ID) ||
        ix.programId.equals(
          new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA")
        )
    );
    if (raydium_cpmm_Ixs.length === 0) return;
    const result = {
      instructions: raydium_cpmm_Ixs,
      inner_ixs: raydium_cpmm_inner_ixs,
      events: undefined,
    };
    bnLayoutFormatter(result);
    return result;
  } catch (error) {
    logger.info(`decodeRaydiumCpmm eror: ${error}`);
    return;
  }
};

export default decodeRaydiumCpmm;
