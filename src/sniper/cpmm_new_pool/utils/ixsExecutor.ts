import {
  ComputeBudgetProgram,
  Keypair,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import { SolanaConnection } from "../../../config";
import { sleep } from "../../../utils";
import {
  emitSniperLog,
  type SniperUiLog,
} from "../sniperUiLog";

/**
 *
 * @param wallet
 * @param ixs
 * @param maxRetries
 * @param baseDelayMs
 * @param cu_limit
 * @param uc_price
 * @returns
 */
export default async function ixsExecutor(
  wallet: Keypair,
  ixs: TransactionInstruction,
  maxRetries: number = 200,
  baseDelayMs: number = 75,
  cu_limit: number = 200_000,
  uc_price: number = 0,
  uiLog?: SniperUiLog
) {
  let attempt = 0;
  let lastErr: any = null;

  while (attempt < maxRetries) {
    attempt++;
    try {
      const latestBlockHash = await SolanaConnection.getLatestBlockhash();

      const messageV0 = new TransactionMessage({
        payerKey: wallet.publicKey,
        recentBlockhash: latestBlockHash.blockhash,
        instructions: [
          ComputeBudgetProgram.setComputeUnitLimit({ units: cu_limit }),
          ComputeBudgetProgram.setComputeUnitPrice({ microLamports: uc_price }),
          ixs,
        ],
      }).compileToV0Message();

      const tx = new VersionedTransaction(messageV0);
      tx.sign([wallet]);

      // Strategy:
      // - if first attempt, use skipPreflight: true for latency.
      // - if we failed previously, turn on preflight simulation on subsequent attempts.
      const skipPreflight = attempt === 1;

      let signature: string;
      try {
        signature = await SolanaConnection.sendRawTransaction(tx.serialize(), {
          skipPreflight,
          preflightCommitment: "processed" as any,
        });
      } catch (sendErr) {
        // Send failed (node refused, account not found on some nodes, etc.)
        lastErr = sendErr;
        emitSniperLog(
          uiLog,
          "info",
          `Attempt ${attempt} — sendRawTransaction error: ${String(sendErr)}`
        );

        // If send failed due to preflight required or simulation failure, we should fallthrough to retry
        // but increase backoff first.
        const delay = Math.floor(
          baseDelayMs * Math.pow(2, attempt - 1) + Math.random() * baseDelayMs
        );
        await sleep(300);
        continue;
      }

      let confirmation;
      try {
        confirmation = await SolanaConnection.confirmTransaction({
          signature,
          blockhash: latestBlockHash.blockhash,
          lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
        });
      } catch (confirmErr) {
        lastErr = confirmErr;
        emitSniperLog(
          uiLog,
          "info",
          `Attempt ${attempt} — confirmTransaction threw: ${String(confirmErr)}`
        );
        // backoff then retry
        const delay = Math.floor(
          baseDelayMs * Math.pow(2, attempt - 1) + Math.random() * baseDelayMs
        );
        await sleep(300);
        continue;
      }

      if (confirmation && confirmation.value && confirmation.value.err) {
        // Transaction landed but was rejected
        lastErr = confirmation.value.err;
        emitSniperLog(
          uiLog,
          "info",
          `Attempt ${attempt} — confirmation error: ${JSON.stringify(
            confirmation.value.err
          )}`
        );

        // If we tried with skipPreflight true, try again with preflight simulation turned on next attempt.
        const delay = Math.floor(
          baseDelayMs * Math.pow(2, attempt - 1) + Math.random() * baseDelayMs
        );
        await sleep(300);
        continue;
      }

      // Success
      emitSniperLog(
        uiLog,
        "info",
        `✅ Success: https://solscan.io/tx/${signature}`
      );

      return signature;
    } catch (error) {
      lastErr = error;
      emitSniperLog(
        uiLog,
        "info",
        `Attempt ${attempt} — unexpected error: ${String(error)}`
      );
      const delay = Math.floor(
        baseDelayMs * Math.pow(2, attempt - 1) + Math.random() * baseDelayMs
      );
      await sleep(300);
      continue;
    }
  }
  const errMsg = `Failed to send/confirm transaction after ${maxRetries} attempts. Last error: ${String(
    lastErr
  )}`;
  emitSniperLog(uiLog, "error", errMsg);

  return;
}
