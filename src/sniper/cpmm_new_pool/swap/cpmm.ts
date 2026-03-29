import { BN } from "bn.js";
import { LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import {
  getAssociatedTokenAddressSync,
  NATIVE_MINT,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { Program } from "@coral-xyz/anchor";
import { RaydiumCpmm, RAYDIUM_CPMM_IDL } from "../idls/raydiumCpmmIdl";
import { CPMM_CONFIG_ID } from "../constants";
import { SolanaConnection } from "../../../config";

const raydiumCpmmProgram = new Program<RaydiumCpmm>(RAYDIUM_CPMM_IDL, {
  connection: SolanaConnection,
});

const cpmmSwapIx = async (
  user: string,
  tokenMint: string,
  tokenAmounts: number,
  poolId: string
) => {
  try {
    const tokenMintPubkey = new PublicKey(tokenMint);
    const cpmmPoolState = new PublicKey(poolId);
    const tokenAmountsInLamports = Math.floor(tokenAmounts * LAMPORTS_PER_SOL);

    const userTokenAta = getAssociatedTokenAddressSync(
      tokenMintPubkey,
      new PublicKey(user)
    );
    // check WSOL account exist and create if not

    const userWsolAta = getAssociatedTokenAddressSync(
      NATIVE_MINT,
      new PublicKey(user)
    );

    const [cpmmTokenVault] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("pool_vault"),
        cpmmPoolState.toBuffer(),
        tokenMintPubkey.toBuffer(),
      ],
      raydiumCpmmProgram.programId
    );
    const [cpmmWsolVault] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("pool_vault"),
        cpmmPoolState.toBuffer(),
        NATIVE_MINT.toBuffer(),
      ],
      raydiumCpmmProgram.programId
    );
    const [cpmmObservationsState] = PublicKey.findProgramAddressSync(
      [Buffer.from("observation"), cpmmPoolState.toBuffer()],
      raydiumCpmmProgram.programId
    );

    const swapIx = await raydiumCpmmProgram.methods
      .swapBaseInput(new BN(tokenAmountsInLamports), new BN(0))
      .accounts({
        payer: new PublicKey(user),
        ammConfig: CPMM_CONFIG_ID,
        poolState: cpmmPoolState,

        inputTokenAccount: userWsolAta,
        outputTokenAccount: userTokenAta,

        inputVault: cpmmWsolVault,
        outputVault: cpmmTokenVault,

        inputTokenMint: NATIVE_MINT,
        outputTokenMint: tokenMintPubkey,
        inputTokenProgram: TOKEN_PROGRAM_ID,
        outputTokenProgram: TOKEN_PROGRAM_ID,

        observationState: cpmmObservationsState,
      })
      .instruction();

    return swapIx;
  } catch (error) {
    console.error(error);
    return;
  }
};

export default cpmmSwapIx;
