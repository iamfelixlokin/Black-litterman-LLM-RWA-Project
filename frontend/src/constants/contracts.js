// ── Deployed contract addresses ───────────────────────────────────────────────
// After running `npx hardhat run scripts/deploy.js --network amoy`
// paste the printed addresses here (or in .env and import via import.meta.env)

export const FUND_ADDRESS = import.meta.env.VITE_FUND_ADDRESS  || "0xa6a0a939b194AbDCedAAD78ce8e4dd78641a8Ec5";
export const USDC_ADDRESS = import.meta.env.VITE_USDC_ADDRESS  || "0x5c08Ebb0129799cC75A67d71B2639989C3b50be8";

export const CHAIN_ID    = 80002;   // Polygon Amoy
export const CHAIN_NAME  = "Polygon Amoy";
export const RPC_URL     = "https://rpc-amoy.polygon.technology";

// ── Minimal ABIs (only functions the UI needs) ────────────────────────────────
export const FUND_ABI = [
  // View
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function navPerToken() view returns (uint256)",
  "function lastNavUpdate() view returns (uint256)",
  "function lastRebalance() view returns (uint256)",
  "function subscriptionFeeBps() view returns (uint256)",
  "function redemptionFeeBps() view returns (uint256)",
  "function getAssets() view returns (string[])",
  "function weights(string) view returns (uint256)",
  "function getFundInfo() view returns (uint256,uint256,uint256,uint256,uint256,uint256)",
  "function previewSubscribe(uint256) view returns (uint256 tokensOut, uint256 feeCharged)",
  "function previewRedeem(uint256) view returns (uint256 usdcOut, uint256 feeCharged)",
  // Write
  "function subscribe(uint256 usdcAmount)",
  "function redeem(uint256 tokenAmount)",
  // Events
  "event NAVUpdated(uint256 indexed newNAV, uint256 totalAUM, uint256 timestamp)",
  "event Subscribed(address indexed investor, uint256 usdcAmount, uint256 tokensIssued, uint256 nav)",
  "event Redeemed(address indexed investor, uint256 tokenAmount, uint256 usdcReturned, uint256 nav)",
];

export const USDC_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
  "function decimals() view returns (uint8)",
  "function faucet()",
];
