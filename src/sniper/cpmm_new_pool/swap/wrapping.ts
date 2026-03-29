import {
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import * as spl from "@solana/spl-token";
import { SolanaConnection } from "../../../config";
import { WSOL_MINT } from "../constants";
import { emitSniperLog, type SniperUiLog } from "../sniperUiLog";

export async function getWalletBalances(wallet: Keypair) {
  try {
    const nativeBalance = await SolanaConnection.getBalance(wallet.publicKey);
    const nativeSOL = nativeBalance / LAMPORTS_PER_SOL;

    let wrappedSOL = 0;
    try {
      const wsolTokenAccount = spl.getAssociatedTokenAddressSync(
        WSOL_MINT,
        wallet.publicKey
      );
      const wsolBalance = await SolanaConnection.getTokenAccountBalance(
        wsolTokenAccount
      );
      wrappedSOL = parseFloat(wsolBalance.value.uiAmountString || "0");
    } catch {
      wrappedSOL = 0;
    }

    const totalSOL = nativeSOL + wrappedSOL;

    return {
      nativeSOL,
      wrappedSOL,
      totalSOL,
    };
  } catch {
    console.log(
      `⚠️  Error checking balances for ${wallet.publicKey.toBase58()}`
    );
    return {
      nativeSOL: 0,
      wrappedSOL: 0,
      totalSOL: 0,
    };
  }
}

/**
 *
 * @param wallet
 * @param tokenMintInString
 * @param tokenAmounts
 * @returns
 */
const wrapping = async (
  wallet: Keypair,
  tokenMintInString: string,
  tokenAmounts: number,
  uiLog?: SniperUiLog
): Promise<boolean> => {
  const logWrap = (msg: string) => {
    console.log(msg);
    emitSniperLog(uiLog, "info", msg);
  };

  try {
    emitSniperLog(uiLog, "info", "Preparing SOL / WSOL for swap…");
    const ixs: TransactionInstruction[] = [];
    const tokenMintInPubkey = new PublicKey(tokenMintInString);
    const balances = await getWalletBalances(wallet);
    const availableNativeSOL = balances.nativeSOL - 0.01; // Reserve for fees
    const availableWrappedSOL = balances.wrappedSOL;

    const userBaseTokenAccount = spl.getAssociatedTokenAddressSync(
      tokenMintInPubkey,
      wallet.publicKey
    );

    const userWSolTokenAccount = spl.getAssociatedTokenAddressSync(
      WSOL_MINT,
      wallet.publicKey
    );

    //check and create baseToken ata instruction
    try {
      const baseTokenInfo = await spl.getAccount(
        SolanaConnection,
        userBaseTokenAccount
      );
      logWrap(
        `Base token ATA exists ✅ amount ${baseTokenInfo.amount.toString()}`
      );
    } catch (error) {
      logWrap("Creating base token ATA…");
      const createBaseTokenAccountIx =
        spl.createAssociatedTokenAccountIdempotentInstruction(
          wallet.publicKey,
          userBaseTokenAccount,
          wallet.publicKey,
          tokenMintInPubkey
        );
      ixs.push(createBaseTokenAccountIx);
    }

    //check and create WSOL ata instruction
    try {
      const wSolTokenInfo = await spl.getAccount(
        SolanaConnection,
        userWSolTokenAccount
      );
      logWrap(
        `WSOL ATA exists ✅ amount ${wSolTokenInfo.amount.toString()}`
      );
    } catch (error) {
      logWrap("Creating WSOL ATA…");
      //create WSol ata instruction
      const createWSOLIx =
        spl.createAssociatedTokenAccountIdempotentInstruction(
          wallet.publicKey,
          userWSolTokenAccount,
          wallet.publicKey,
          WSOL_MINT
        );
      ixs.push(createWSOLIx);
    }

    logWrap("Applying wrap strategy for swap size…");
    if (availableWrappedSOL >= tokenAmounts) {
      logWrap(
        `💫 Using existing ${tokenAmounts.toFixed(4)} wSOL (no wrap tx needed)`
      );
    } else if (availableNativeSOL >= tokenAmounts) {
      logWrap(
        `🔄 Wrapping ${tokenAmounts.toFixed(4)} SOL → wSOL`
      );
      const solAmount = Math.floor(tokenAmounts * LAMPORTS_PER_SOL);
      const wrapSOLIx = SystemProgram.transfer({
        fromPubkey: wallet.publicKey,
        toPubkey: userWSolTokenAccount,
        lamports: solAmount,
      });
      ixs.push(wrapSOLIx);

      const syncNativeIx =
        spl.createSyncNativeInstruction(userWSolTokenAccount);
      ixs.push(syncNativeIx);
    } else {
      // Case 3: Need to combine both - use all wSOL + wrap some native SOL
      const additionalWrapNeeded = tokenAmounts - availableWrappedSOL;
      logWrap(
        `🔄 Using ${availableWrappedSOL.toFixed(
          4
        )} wSOL + wrapping ${additionalWrapNeeded.toFixed(4)} SOL`
      );
      if (
        additionalWrapNeeded > 0 &&
        availableNativeSOL >= additionalWrapNeeded
      ) {
        const wrapSOLIx = SystemProgram.transfer({
          fromPubkey: wallet.publicKey,
          toPubkey: userWSolTokenAccount,
          lamports: Math.floor(additionalWrapNeeded * LAMPORTS_PER_SOL),
        });
        ixs.push(wrapSOLIx);

        const syncNativeIx =
          spl.createSyncNativeInstruction(userWSolTokenAccount);
        ixs.push(syncNativeIx);
      } else {
        logWrap("⚠️ Insufficient combined native + wSOL for swap");
        return false;
      }
    }

    if (ixs.length) {
      const latestBlockHash = await SolanaConnection.getLatestBlockhash();
      const messageV0 = new TransactionMessage({
        payerKey: wallet.publicKey,
        recentBlockhash: latestBlockHash.blockhash,
        instructions: ixs,
      }).compileToV0Message();

      const transaction = new VersionedTransaction(messageV0);
      transaction.sign([wallet]);

      const signature = await SolanaConnection.sendRawTransaction(
        transaction.serialize(),
        { skipPreflight: true }
      );

      const confirmation = await SolanaConnection.confirmTransaction({
        signature,
        ...latestBlockHash,
      });

      if (confirmation.value.err) {
        logWrap(`Wrap tx confirmation error: ${JSON.stringify(confirmation.value.err)}`);
      } else {
        logWrap(
          `Wrap tx OK: https://solscan.io/tx/${signature}`
        );
      }
    }

    emitSniperLog(uiLog, "info", "SOL / WSOL preparation finished");
    return true;
  } catch (error) {
    emitSniperLog(
      uiLog,
      "error",
      `Error in wrapping: ${error instanceof Error ? error.message : String(error)}`
    );
    return false;
  }
};

export default wrapping;
