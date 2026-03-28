/**
 * Interact with a deployed RWAFund on Polygon Amoy
 *
 * Usage:
 *   npx hardhat run scripts/interact.js --network amoy
 *
 * Requires in .env:
 *   FUND_CONTRACT_ADDRESS
 *   USDC_CONTRACT_ADDRESS
 *   DEPLOYER_PRIVATE_KEY   (acts as investor + oracle for demo)
 */

const { ethers } = require("hardhat");

// ─── Helpers ────────────────────────────────────────────────
function fmt6(n)  { return (Number(n) / 1e6).toFixed(6) + " USDC"; }
function fmt18(n) { return ethers.formatEther(n) + " BLSF"; }

async function printState(fund, label = "Fund State") {
  const info = await fund.getFundInfo();
  console.log(`\n--- ${label} ---`);
  console.log(`  NAV/token    : ${fmt6(info[0])}`);
  console.log(`  Total supply : ${fmt18(info[1])}`);
  console.log(`  Total AUM    : ${fmt6(info[2])}`);
  console.log(`  Last NAV upd : ${info[3] > 0 ? new Date(Number(info[3]) * 1000).toISOString() : "never"}`);
  console.log(`  Last rebal   : ${info[5] > 0 ? new Date(Number(info[5]) * 1000).toISOString() : "never"}`);  // index 5 = lastRebalance
  console.log(`  USDC balance : ${fmt6(info[5])}`);  // actually index 5 is usdcBalance per contract
}

// ─── Main ────────────────────────────────────────────────────
async function main() {
  const [signer] = await ethers.getSigners();
  console.log("=".repeat(60));
  console.log(`Interacting as: ${signer.address}`);

  const fundAddress = process.env.FUND_CONTRACT_ADDRESS;
  const usdcAddress = process.env.USDC_CONTRACT_ADDRESS;
  if (!fundAddress || !usdcAddress) {
    throw new Error("Set FUND_CONTRACT_ADDRESS and USDC_CONTRACT_ADDRESS in .env");
  }

  const fund = await ethers.getContractAt("RWAFund", fundAddress, signer);
  const usdc = await ethers.getContractAt("MockUSDC", usdcAddress, signer);

  // ── Step 0: print initial state ──────────────────────────
  await printState(fund, "Initial state");

  // ── Step 1: Faucet USDC ──────────────────────────────────
  console.log("\n[1] Minting 100,000 USDC from faucet...");
  let tx = await usdc.faucet();
  await tx.wait();
  const usdcBalance = await usdc.balanceOf(signer.address);
  console.log(`    USDC balance: ${fmt6(usdcBalance)}`);

  // ── Step 2: Oracle pushes initial weights ─────────────────
  console.log("\n[2] Oracle: posting initial portfolio weights...");
  const assets  = ["AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "TSLA", "META"];
  const weights = [1600, 1500, 1400, 1300, 1500, 1900, 800]; // sum = 10000 bps
  tx = await fund.updateRebalance(assets, weights);
  await tx.wait();
  console.log("    Weights stored:");
  for (let i = 0; i < assets.length; i++) {
    console.log(`      ${assets[i]}: ${weights[i] / 100}%`);
  }

  // ── Step 3: Subscribe 1,000 USDC ──────────────────────────
  console.log("\n[3] Investor subscribes 1,000 USDC...");
  const subAmount = 1_000e6; // $1,000 USDC (6 decimals)

  // Preview first
  const preview = await fund.previewSubscribe(subAmount);
  console.log(`    Tokens out (preview): ${fmt18(preview.tokensOut)}`);
  console.log(`    Fee (preview)        : ${fmt6(preview.feeCharged)}`);

  // Approve + subscribe
  tx = await usdc.approve(fundAddress, subAmount);
  await tx.wait();
  tx = await fund.subscribe(subAmount);
  await tx.wait();

  const tokenBalance = await fund.balanceOf(signer.address);
  console.log(`    BLSF balance: ${fmt18(tokenBalance)}`);

  // ── Step 4: Oracle updates NAV (simulate +5% portfolio gain) ──
  console.log("\n[4] Oracle: updating NAV (+5% gain)...");
  const currentNAV = await fund.navPerToken();
  const newNAV     = (currentNAV * 105n) / 100n;  // +5%
  const supply     = await fund.totalSupply();
  const newAUM     = (supply * newNAV) / BigInt(1e18);
  tx = await fund.updateNAV(newNAV, newAUM);
  await tx.wait();
  console.log(`    New NAV: ${fmt6(newNAV)}`);

  // ── Step 5: Redeem half the tokens ────────────────────────
  console.log("\n[5] Investor redeems 50% of tokens...");
  const redeemAmount = tokenBalance / 2n;
  const redeemPreview = await fund.previewRedeem(redeemAmount);
  console.log(`    USDC out (preview): ${fmt6(redeemPreview.usdcOut)}`);

  tx = await fund.redeem(redeemAmount);
  await tx.wait();

  const finalUSDC   = await usdc.balanceOf(signer.address);
  const finalTokens = await fund.balanceOf(signer.address);
  console.log(`    Remaining BLSF  : ${fmt18(finalTokens)}`);
  console.log(`    USDC received   : ${fmt6(finalUSDC)}`);

  // ── Step 6: Final state ───────────────────────────────────
  await printState(fund, "Final state");

  console.log("\n[OK] Interaction demo complete.");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
