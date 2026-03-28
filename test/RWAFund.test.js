/**
 * RWAFund – Hardhat / Chai test suite
 *
 * Run: npx hardhat test
 */

const { expect } = require("chai");
const { ethers }  = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");

// ─── Constants ──────────────────────────────────────────────
const INITIAL_NAV    = 100n * 10n ** 6n;   // $100 USDC
const ONE_USDC       = 10n ** 6n;
const ONE_TOKEN      = 10n ** 18n;
const SUBSCRIBE_AMT  = 1_000n * ONE_USDC;  // $1,000
const DEFAULT_ASSETS = ["AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "TSLA", "META"];
const DEFAULT_WEIGHTS = [1600n, 1500n, 1400n, 1300n, 1500n, 1900n, 800n]; // sums to 10000

// ─── Fixture ─────────────────────────────────────────────────
async function deployFixture() {
  const [owner, oracle, investor, other] = await ethers.getSigners();

  // Deploy MockUSDC
  const MockUSDC = await ethers.getContractFactory("MockUSDC");
  const usdc = await MockUSDC.deploy();

  // Deploy RWAFund
  const RWAFund = await ethers.getContractFactory("RWAFund");
  const fund = await RWAFund.deploy(
    await usdc.getAddress(),
    owner.address,
    oracle.address
  );

  // Mint USDC for investor
  await usdc.mint(investor.address, 1_000_000n * ONE_USDC); // $1M

  return { fund, usdc, owner, oracle, investor, other };
}

// ─── Tests ──────────────────────────────────────────────────
describe("RWAFund", function () {

  // ── Deployment ───────────────────────────────────────────
  describe("Deployment", function () {
    it("sets correct initial NAV", async function () {
      const { fund } = await loadFixture(deployFixture);
      expect(await fund.navPerToken()).to.equal(INITIAL_NAV);
    });

    it("grants roles correctly", async function () {
      const { fund, owner, oracle } = await loadFixture(deployFixture);
      const ORACLE_ROLE  = await fund.ORACLE_ROLE();
      const MANAGER_ROLE = await fund.MANAGER_ROLE();
      expect(await fund.hasRole(ORACLE_ROLE,  oracle.address)).to.be.true;
      expect(await fund.hasRole(MANAGER_ROLE, owner.address)).to.be.true;
    });

    it("starts with zero supply", async function () {
      const { fund } = await loadFixture(deployFixture);
      expect(await fund.totalSupply()).to.equal(0n);
    });
  });

  // ── Soulbound ─────────────────────────────────────────────
  describe("Non-transferable (soulbound)", function () {
    it("reverts on transfer()", async function () {
      const { fund, investor, other } = await loadFixture(deployFixture);
      await expect(
        fund.connect(investor).transfer(other.address, ONE_TOKEN)
      ).to.be.revertedWith("BLSF: non-transferable");
    });

    it("reverts on approve()", async function () {
      const { fund, investor, other } = await loadFixture(deployFixture);
      await expect(
        fund.connect(investor).approve(other.address, ONE_TOKEN)
      ).to.be.revertedWith("BLSF: non-transferable");
    });

    it("reverts on transferFrom()", async function () {
      const { fund, investor, other } = await loadFixture(deployFixture);
      await expect(
        fund.connect(investor).transferFrom(investor.address, other.address, ONE_TOKEN)
      ).to.be.revertedWith("BLSF: non-transferable");
    });
  });

  // ── Oracle: updateNAV ────────────────────────────────────
  describe("Oracle: updateNAV", function () {
    it("updates NAV and emits event", async function () {
      const { fund, oracle } = await loadFixture(deployFixture);
      const newNAV = 105n * ONE_USDC; // $105
      const tx = fund.connect(oracle).updateNAV(newNAV, 0n);
      await expect(tx).to.emit(fund, "NAVUpdated");
      expect(await fund.navPerToken()).to.equal(newNAV);
    });

    it("reverts if caller lacks ORACLE_ROLE", async function () {
      const { fund, investor } = await loadFixture(deployFixture);
      await expect(
        fund.connect(investor).updateNAV(105n * ONE_USDC, 0n)
      ).to.be.reverted;
    });

    it("reverts on zero NAV", async function () {
      const { fund, oracle } = await loadFixture(deployFixture);
      await expect(
        fund.connect(oracle).updateNAV(0n, 0n)
      ).to.be.revertedWith("NAV must be > 0");
    });
  });

  // ── Oracle: updateRebalance ───────────────────────────────
  describe("Oracle: updateRebalance", function () {
    it("stores weights and emits Rebalanced", async function () {
      const { fund, oracle } = await loadFixture(deployFixture);
      await expect(
        fund.connect(oracle).updateRebalance(DEFAULT_ASSETS, DEFAULT_WEIGHTS)
      ).to.emit(fund, "Rebalanced");

      const assets = await fund.getAssets();
      expect(assets.length).to.equal(DEFAULT_ASSETS.length);
      expect(await fund.weights("AAPL")).to.equal(1600n);
    });

    it("reverts if weights != 10000 bps", async function () {
      const { fund, oracle } = await loadFixture(deployFixture);
      const badWeights = [2000n, 2000n, 2000n, 2000n, 2000n, 500n, 500n]; // 11000
      await expect(
        fund.connect(oracle).updateRebalance(DEFAULT_ASSETS, badWeights)
      ).to.be.revertedWith("Weights != 10000 bps");
    });

    it("replaces old weights on subsequent calls", async function () {
      const { fund, oracle } = await loadFixture(deployFixture);
      await fund.connect(oracle).updateRebalance(DEFAULT_ASSETS, DEFAULT_WEIGHTS);

      // New weights: only 2 assets
      await fund.connect(oracle).updateRebalance(["AAPL", "MSFT"], [5000n, 5000n]);
      const assets = await fund.getAssets();
      expect(assets.length).to.equal(2);
      expect(await fund.weights("GOOGL")).to.equal(0n); // old removed
    });
  });

  // ── Subscribe ─────────────────────────────────────────────
  describe("Subscribe", function () {
    it("mints correct tokens and emits Subscribed", async function () {
      const { fund, usdc, investor } = await loadFixture(deployFixture);
      const fundAddr = await fund.getAddress();

      await usdc.connect(investor).approve(fundAddr, SUBSCRIBE_AMT);
      await expect(fund.connect(investor).subscribe(SUBSCRIBE_AMT))
        .to.emit(fund, "Subscribed");

      // With 0.5% fee: net = $995; tokensOut = 995e6 * 1e18 / 100e6 = 9.95 tokens
      const expected = (995n * ONE_USDC * ONE_TOKEN) / INITIAL_NAV;
      expect(await fund.balanceOf(investor.address)).to.equal(expected);
    });

    it("reverts below minimum subscription", async function () {
      const { fund, usdc, investor } = await loadFixture(deployFixture);
      const tooSmall = 5n * ONE_USDC; // $5 < $10 minimum
      await usdc.connect(investor).approve(await fund.getAddress(), tooSmall);
      await expect(
        fund.connect(investor).subscribe(tooSmall)
      ).to.be.revertedWith("Below minimum");
    });

    it("reverts when paused", async function () {
      const { fund, usdc, owner, investor } = await loadFixture(deployFixture);
      await fund.connect(owner).pause();
      await usdc.connect(investor).approve(await fund.getAddress(), SUBSCRIBE_AMT);
      await expect(
        fund.connect(investor).subscribe(SUBSCRIBE_AMT)
      ).to.be.reverted;
    });

    it("previewSubscribe matches actual", async function () {
      const { fund, usdc, investor } = await loadFixture(deployFixture);
      const preview = await fund.previewSubscribe(SUBSCRIBE_AMT);
      await usdc.connect(investor).approve(await fund.getAddress(), SUBSCRIBE_AMT);
      await fund.connect(investor).subscribe(SUBSCRIBE_AMT);
      expect(await fund.balanceOf(investor.address)).to.equal(preview.tokensOut);
    });
  });

  // ── Redeem ────────────────────────────────────────────────
  describe("Redeem", function () {
    async function subscribeFixture() {
      const base = await loadFixture(deployFixture);
      const { fund, usdc, investor } = base;
      await usdc.connect(investor).approve(await fund.getAddress(), SUBSCRIBE_AMT);
      await fund.connect(investor).subscribe(SUBSCRIBE_AMT);
      return base;
    }

    it("burns tokens and returns USDC", async function () {
      const { fund, usdc, investor } = await subscribeFixture();
      const tokensBefore = await fund.balanceOf(investor.address);
      const usdcBefore   = await usdc.balanceOf(investor.address);

      await expect(fund.connect(investor).redeem(tokensBefore))
        .to.emit(fund, "Redeemed");

      expect(await fund.balanceOf(investor.address)).to.equal(0n);
      expect(await usdc.balanceOf(investor.address)).to.be.gt(usdcBefore);
    });

    it("reverts if insufficient balance", async function () {
      const { fund, investor } = await loadFixture(deployFixture);
      await expect(
        fund.connect(investor).redeem(ONE_TOKEN)
      ).to.be.revertedWith("Insufficient balance");
    });

    it("previewRedeem matches actual USDC returned", async function () {
      const { fund, usdc, investor } = await subscribeFixture();
      const tokens  = await fund.balanceOf(investor.address);
      const preview = await fund.previewRedeem(tokens);
      const before  = await usdc.balanceOf(investor.address);
      await fund.connect(investor).redeem(tokens);
      const after   = await usdc.balanceOf(investor.address);
      expect(after - before).to.equal(preview.usdcOut);
    });
  });

  // ── Full cycle: subscribe → NAV update → redeem ──────────
  describe("Full cycle", function () {
    it("investor profits after +10% NAV increase", async function () {
      const { fund, usdc, oracle, investor } = await loadFixture(deployFixture);

      const investAmount = 1_000n * ONE_USDC;
      await usdc.connect(investor).approve(await fund.getAddress(), investAmount);
      await fund.connect(investor).subscribe(investAmount);

      const tokens = await fund.balanceOf(investor.address);

      // Oracle pushes +10% NAV
      const newNAV = (INITIAL_NAV * 110n) / 100n;
      await fund.connect(oracle).updateNAV(newNAV, 0n);

      // Fund must hold enough USDC – mint more to simulate portfolio gains
      await usdc.mint(await fund.getAddress(), 100n * ONE_USDC);

      const usdcBefore = await usdc.balanceOf(investor.address);
      await fund.connect(investor).redeem(tokens);
      const usdcAfter = await usdc.balanceOf(investor.address);

      // Net USDC returned > original investment minus sub fee
      const netInvested = investAmount - (investAmount * 50n / 10_000n);
      expect(usdcAfter - usdcBefore).to.be.gt(netInvested);
    });
  });

  // ── Manager functions ─────────────────────────────────────
  describe("Manager functions", function () {
    it("setFees updates fees", async function () {
      const { fund, owner } = await loadFixture(deployFixture);
      await fund.connect(owner).setFees(100n, 100n); // 1%
      expect(await fund.subscriptionFeeBps()).to.equal(100n);
      expect(await fund.redemptionFeeBps()).to.equal(100n);
    });

    it("setFees reverts if fee > 5%", async function () {
      const { fund, owner } = await loadFixture(deployFixture);
      await expect(fund.connect(owner).setFees(501n, 0n))
        .to.be.revertedWith("Fee too high");
    });

    it("pause / unpause works", async function () {
      const { fund, usdc, owner, investor } = await loadFixture(deployFixture);
      await fund.connect(owner).pause();
      await usdc.connect(investor).approve(await fund.getAddress(), SUBSCRIBE_AMT);
      await expect(
        fund.connect(investor).subscribe(SUBSCRIBE_AMT)
      ).to.be.reverted;

      await fund.connect(owner).unpause();
      await expect(
        fund.connect(investor).subscribe(SUBSCRIBE_AMT)
      ).to.emit(fund, "Subscribed");
    });

    it("collectFees sends surplus to recipient", async function () {
      const { fund, usdc, owner, oracle, investor, other } = await loadFixture(deployFixture);
      // Subscribe to accumulate fees
      await usdc.connect(investor).approve(await fund.getAddress(), SUBSCRIBE_AMT);
      await fund.connect(investor).subscribe(SUBSCRIBE_AMT);

      // Simulate portfolio gain: add USDC to the fund directly
      await usdc.mint(await fund.getAddress(), 100n * ONE_USDC);

      // Update NAV so backing > actual balance → no, we want balance > backing
      // After subscribe, fees stay in contract, so balance > token_backing
      const before = await usdc.balanceOf(other.address);
      await fund.connect(owner).collectFees(other.address);
      const after = await usdc.balanceOf(other.address);
      expect(after).to.be.gt(before);
    });
  });

  // ── getFundInfo ───────────────────────────────────────────
  describe("getFundInfo", function () {
    it("returns correct tuple after subscribe", async function () {
      const { fund, usdc, investor } = await loadFixture(deployFixture);
      await usdc.connect(investor).approve(await fund.getAddress(), SUBSCRIBE_AMT);
      await fund.connect(investor).subscribe(SUBSCRIBE_AMT);
      const info = await fund.getFundInfo();
      expect(info[0]).to.equal(INITIAL_NAV);   // navPerToken
      expect(info[1]).to.be.gt(0n);            // totalSupply
    });
  });
});

