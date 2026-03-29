import { Keypair, PublicKey } from "@solana/web3.js";
import { bs58 } from "@coral-xyz/anchor/dist/cjs/utils/bytes";

export const isValidTokenAddress = (address: string): boolean => {
  try {
    const pk = new PublicKey(address);
    return pk.toBase58() === address;
  } catch {
    return false;
  }
};

export const isValidPrivateKey = (privateKey: string): boolean => {
  try {
    const decodedKey = bs58.decode(privateKey);
    if (decodedKey.length !== 64) {
      return false;
    }
    Keypair.fromSecretKey(decodedKey);
    return true;
  } catch {
    return false;
  }
};

export const isValidAmount = (input: string | number): boolean => {
  try {
    const amount =
      typeof input === "number" ? input : parseFloat(String(input));
    if (isNaN(amount) || !Number.isFinite(amount)) {
      return false;
    }
    return amount > 0;
  } catch {
    return false;
  }
};
