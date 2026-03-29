import Client, {
  CommitmentLevel,
  SubscribeRequest,
} from "@triton-one/yellowstone-grpc";
import { GRPC_ENDPOINT, xTOKEN } from "../../config";
import { Keypair } from "@solana/web3.js";
import { TransactionFormatter } from "./utils/transaction-formatter";
import { RAYDIUM_CPMM_PROGRAM_ID, WSOL_MINT } from "./constants";
import parsedTransactionOutput from "./utils/parsedTransaction";
import cpmmSwapIx from "./swap/cpmm";
import wrapping from "./swap/wrapping";
import ixsExecutor from "./utils/ixsExecutor";
import decodeRaydiumCpmm from "./utils/decodeRaydiumCpmm";
import extractPoolInfoFromFormattedTxn from "./utils/extractPoolInfoFromFormattedTxn";
import { sleep } from "../../utils";
import { emitSniperLog, type SniperUiLog } from "./sniperUiLog";

const TXN_FORMATTER = new TransactionFormatter();

const streamRaydiumNewTokens = async (
  wallet: Keypair,
  tokenMint: string,
  tokenAmounts: number,
  uiLog?: SniperUiLog
) => {
  const client = new Client(GRPC_ENDPOINT, xTOKEN, undefined);
  const request = createSubscribeRequest();

  const wrapStatus = await wrapping(
    wallet,
    tokenMint,
    tokenAmounts,
    uiLog
  );

  if (!wrapStatus) {
    emitSniperLog(
      uiLog,
      "error",
      "Insufficient balance for swap amount (after fee reserve)."
    );
    return {
      status: false,
      msg: "Error: The amount you entered is greater than your wallet balance.",
    };
  }

  while (true) {
    try {
      const isSniped = await handleStreamEvents(
        client,
        request,
        wallet,
        tokenMint,
        tokenAmounts,
        uiLog
      );

      if (isSniped) {
        emitSniperLog(uiLog, "info", "Sniping is successful");
        return {
          status: true,
          msg: `Success. ${tokenMint} is successfully sniped`,
        };
      }
    } catch (error) {
      emitSniperLog(
        uiLog,
        "error",
        `Stream error, restarting in 1 second: ${String(error)}`
      );
      sleep(1000);
    }
  }
};

// Helper functions
const createSubscribeRequest = (): SubscribeRequest => {
  return {
    accounts: {},
    slots: {},
    transactions: {
      CPMM_NEW_POOL: {
        vote: false,
        failed: false,
        signature: undefined,
        accountInclude: [RAYDIUM_CPMM_PROGRAM_ID.toBase58()],
        accountExclude: [],
        accountRequired: [],
      },
    },
    transactionsStatus: {},
    entry: {},
    blocks: {},
    blocksMeta: {},
    accountsDataSlice: [],
    ping: undefined,
    commitment: CommitmentLevel.CONFIRMED,
  };
};

const handleStreamEvents = async (
  client: Client,
  request: SubscribeRequest,
  wallet: Keypair,
  tokenMint: string,
  tokenAmounts: number,
  uiLog?: SniperUiLog
): Promise<Boolean> => {
  emitSniperLog(uiLog, "info", "Streaming started…");
  emitSniperLog(uiLog, "info", "Listening for new CPMM pools");

  const stream = await client.subscribe();
  let isSniped = false;
  let isStreamEnded = false;

  const streamClosed = new Promise<void>((resolve, reject) => {
    stream.on("error", (error) => {
      emitSniperLog(uiLog, "error", `gRPC stream error: ${String(error)}`);
      if (!isStreamEnded) {
        reject(error);
      }
      stream.end();
    });
    stream.on("end", () => {
      emitSniperLog(uiLog, "info", "gRPC stream ended");
      resolve();
    });
    stream.on("close", () => {
      emitSniperLog(uiLog, "info", "gRPC stream closed");
      resolve();
    });
  });

  stream.on("data", async (data) => {
    if (data?.transaction) {
      const txn = TXN_FORMATTER.formTransactionFromJson(
        data.transaction,
        Date.now()
      );
      const parsedInstructions = decodeRaydiumCpmm(txn);

      if (!parsedInstructions) {
        return;
      }

      const formattedTxn = parsedTransactionOutput(parsedInstructions, txn);

      if (formattedTxn == undefined) {
        return;
      }

      const poolInfo = extractPoolInfoFromFormattedTxn(formattedTxn);

      if (!poolInfo) {
        emitSniperLog(
          uiLog,
          "info",
          "New pool detected, but unable to extract pool information."
        );
        return;
      }

      const [token0Mint, token1Mint, openTime] = [
        poolInfo.token0Mint,
        poolInfo.token1Mint,
        poolInfo.openTime,
      ];

      // const isTargetPair =
      //   (token0Mint === WSOL_MINT.toBase58() && token1Mint === tokenMint) ||
      //   (token1Mint === WSOL_MINT.toBase58() && token0Mint === tokenMint);

      // if (!isTargetPair) {
      //   logger.info(
      //     `New pool detected, but it is not the target pool. ${JSON.stringify(
      //       poolInfo
      //     )}`
      //   );
      //   return;
      // }

      emitSniperLog(
        uiLog,
        "info",
        `Target pool detected: ${JSON.stringify(poolInfo)}`
      );

      // const ix = await cpmmSwapIx(
      //   wallet.publicKey.toBase58(),
      //   tokenMint,
      //   tokenAmounts,
      //   poolInfo.poolState
      // );
      const ix = await cpmmSwapIx(
        wallet.publicKey.toBase58(),
        token0Mint === WSOL_MINT.toBase58() ? token1Mint : token0Mint,
        tokenAmounts,
        poolInfo.poolState
      );

      if (!ix) {
        emitSniperLog(uiLog, "error", "Failed to build CPMM swap instruction");
        return;
      }

      // check opentime
      const openTimeMs = openTime * 1000;

      while (true) {
        try {
          const currentTime = Date.now();

          if (openTimeMs + 200 > currentTime) {
            emitSniperLog(uiLog, "info", "Waiting for pool open time…");
            continue;
          } else {
            emitSniperLog(uiLog, "info", "Pool open time reached");
            break;
          }
        } catch (error) {
          emitSniperLog(
            uiLog,
            "error",
            `Open time error: ${JSON.stringify(error)}`
          );
          return;
        }
      }

      const res = await ixsExecutor(
        wallet,
        ix,
        undefined,
        undefined,
        400_000,
        10_000,
        uiLog
      );

      if (res) {
        isSniped = true;
      }

      isStreamEnded = true;
      stream.cancel();
    }
  });

  await new Promise<void>((resolve, reject) => {
    stream.write(request, (err: any) => {
      if (err === null || err === undefined) {
        resolve();
      } else {
        reject(err);
      }
    });
  }).catch((reason) => {
    emitSniperLog(uiLog, "error", `Subscribe write failed: ${String(reason)}`);
    throw reason;
  });

  await streamClosed;

  return isSniped;
};

export default streamRaydiumNewTokens;
