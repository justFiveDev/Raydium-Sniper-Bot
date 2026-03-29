import dotenv from "dotenv";
import { Connection } from "@solana/web3.js";

dotenv.config();

export interface TokenInfo {
  mint: string;
  decimals: number;
}

export const PORT = Number(process.env.PORT) || 5000;

/** Required in production; dev falls back to a fixed placeholder (not for public deployment). */
export const SESSION_SECRET =
  process.env.SESSION_SECRET || "dev-only-change-me-in-production";

export const RPC_ENDPOINT =
  process.env.RPC_ENDPOINT || "https://api.mainnet-beta.solana.com";
export const GRPC_ENDPOINT = process.env.GRPC_ENDPOINT || "";
export const xTOKEN = process.env.xToken || "";
export const SolanaConnection = new Connection(RPC_ENDPOINT, "confirmed");

/** When `1`, enables `POST /api/sniper/logs/sample` for UI testing (keep off in production). */
export const ENABLE_SAMPLE_SNIPER_LOGS =
  process.env.ENABLE_SAMPLE_SNIPER_LOGS === "1";
