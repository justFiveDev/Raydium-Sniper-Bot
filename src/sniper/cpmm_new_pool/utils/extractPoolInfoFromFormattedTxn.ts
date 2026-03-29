import logger from "../../../logger";
import { Meta, Transaction } from "../constants";

const extractPoolInfoFromFormattedTxn = (formattedTxn: any) => {
  try {
    const meta: Meta = formattedTxn.meta;
    const innerInstructions = meta.innerInstructions;
    const transaction: Transaction = formattedTxn.transaction;
    // const blockHash = transaction.message.recentBlockhash || "";
    const initializeInnerInstruction = innerInstructions.find(
      (innerInstruction) => innerInstruction.name === "initialize"
    );

    if (!initializeInnerInstruction) return;

    const token0MintAccount = initializeInnerInstruction.accounts.find(
      (account) => account.name === "token_0_mint"
    );
    const token1MintAccount = initializeInnerInstruction.accounts.find(
      (account) => account.name === "token_1_mint"
    );
    const poolStateAccount = initializeInnerInstruction.accounts.find(
      (account) => account.name === "pool_state"
    );

    const openTime = initializeInnerInstruction.args.open_time;

    if (
      token0MintAccount &&
      token1MintAccount &&
      poolStateAccount &&
      poolStateAccount &&
      openTime != undefined
    ) {
      return {
        openTime,
        token0Mint: token0MintAccount.pubkey,
        token1Mint: token1MintAccount.pubkey,
        poolState: poolStateAccount.pubkey,
      };
    } else {
      return;
    }
  } catch (error) {
    logger.info(`extractPoolInfoFromFormattedTxn error:", ${error}`);
    return;
  }
};

export default extractPoolInfoFromFormattedTxn;
