// Shared Stellar network config — switch testnet/mainnet via STELLAR_NETWORK env var.
import * as StellarSdk from "npm:stellar-sdk@12";

const NETWORK = (Deno.env.get("STELLAR_NETWORK") ?? "TESTNET").toUpperCase();
export const IS_MAINNET = NETWORK === "MAINNET" || NETWORK === "PUBLIC";

export const HORIZON_URL =
  Deno.env.get("STELLAR_HORIZON_URL") ??
  (IS_MAINNET ? "https://horizon.stellar.org" : "https://horizon-testnet.stellar.org");

export const NETWORK_PASSPHRASE = IS_MAINNET
  ? StellarSdk.Networks.PUBLIC
  : StellarSdk.Networks.TESTNET;

export const EXPLORER_BASE = IS_MAINNET
  ? "https://stellar.expert/explorer/public"
  : "https://stellar.expert/explorer/testnet";

// Circle's USDC issuers
export const USDC_ASSET_CODE = "USDC";
export const USDC_ISSUER = Deno.env.get("STELLAR_USDC_ISSUER") ?? (IS_MAINNET
  ? "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN" // Circle mainnet
  : "GBBD47IF6LWK7P7MDEVSCWTTCJM4RTQR6EPCEGYEZ2OM4KBS42B23HGC"); // Circle testnet

export const usdcAsset = () => new StellarSdk.Asset(USDC_ASSET_CODE, USDC_ISSUER);
