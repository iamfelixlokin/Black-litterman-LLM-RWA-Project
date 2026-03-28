/**
 * Deploy RWAFund and MockUSDC to Polygon Amoy testnet
 *
 * Usage:
 *   npx hardhat run scripts/deploy.js --network amoy
 *   npx hardhat run scripts/deploy.js --network hardhat
 *
 * After deployment, copy the printed addresses into your .env file:
 *   FUND_CONTRACT_ADDRESS=0x...
 *   USDC_CONTRACT_ADDRESS=0x...
 */

const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();

  console.log("=".repeat(60));
  console.log("BL-RWA Fund Deployment");
  console.log("=".repeat(60));
  console.log(`Network   : ${network.name} (chainId ${network.chainId})`);
  console.log(`Deployer  : ${deployer.address}`);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`Balance   : ${ethers.formatEther(balance)} MATIC`);
  console.log("-".repeat(60));

  // -------------------------------------------------------
  // 1. Deploy MockUSDC (testnet only – on mainnet use real USDC)
  // -------------------------------------------------------
  console.log("\n[1/3] Deploying MockUSDC...");
  const MockUSDC = await ethers.getContractFactory("MockUSDC");
  const usdc = await MockUSDC.deploy();
  await usdc.waitForDeployment();
  const usdcAddress = await usdc.getAddress();
  console.log(`      MockUSDC deployed → ${usdcAddress}`);

  // -------------------------------------------------------
  // 2. Determine oracle address
  //    On testnet the deployer acts as oracle; set a separate
  //    ORACLE_ADDRESS in .env for production.
  // -------------------------------------------------------
  const oracleAddress = process.env.ORACLE_ADDRESS || deployer.address;
  console.log(`\n[2/3] Oracle address  : ${oracleAddress}`);

  // -------------------------------------------------------
  // 3. Deploy RWAFund
  // -------------------------------------------------------
  console.log("\n[3/3] Deploying RWAFund...");
  const RWAFund = await ethers.getContractFactory("RWAFund");
  const fund = await RWAFund.deploy(
    usdcAddress,       // USDC token
    deployer.address,  // manager (DEFAULT_ADMIN + MANAGER)
    oracleAddress      // oracle
  );
  await fund.waitForDeployment();
  const fundAddress = await fund.getAddress();
  console.log(`      RWAFund deployed  → ${fundAddress}`);

  // -------------------------------------------------------
  // 4. Verify initial state
  // -------------------------------------------------------
  const info = await fund.getFundInfo();
  console.log("\n--- Initial Fund State ---");
  console.log(`  NAV per token  : $${Number(info[0]) / 1e6} USDC`);
  console.log(`  Total supply   : ${ethers.formatEther(info[1])} BLSF`);
  console.log(`  Total AUM      : $${Number(info[2]) / 1e6} USDC`);

  // -------------------------------------------------------
  // 5. Save addresses to deployment artifact
  // -------------------------------------------------------
  const artifact = {
    network: network.name,
    chainId: network.chainId.toString(),
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
    contracts: {
      MockUSDC: usdcAddress,
      RWAFund:  fundAddress,
    },
  };

  const outDir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `${network.name}.json`);
  fs.writeFileSync(outFile, JSON.stringify(artifact, null, 2));
  console.log(`\nDeployment artifact saved → ${outFile}`);

  // -------------------------------------------------------
  // 6. Print .env snippet
  // -------------------------------------------------------
  console.log("\n" + "=".repeat(60));
  console.log("Add these to your .env file:");
  console.log("=".repeat(60));
  console.log(`FUND_CONTRACT_ADDRESS=${fundAddress}`);
  console.log(`USDC_CONTRACT_ADDRESS=${usdcAddress}`);
  console.log(`ORACLE_ADDRESS=${oracleAddress}`);
  console.log("=".repeat(60));
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
