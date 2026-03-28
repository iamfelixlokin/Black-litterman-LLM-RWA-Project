import { useState, useEffect, useCallback } from "react";
import { Contract, JsonRpcProvider, formatUnits } from "ethers";
import { FUND_ADDRESS, USDC_ADDRESS, FUND_ABI, USDC_ABI, RPC_URL } from "../constants/contracts.js";

const readProvider = new JsonRpcProvider(RPC_URL);

export function useFund(signer, address) {
  const [fundInfo, setFundInfo]     = useState(null);
  const [userInfo, setUserInfo]     = useState(null);
  const [assets, setAssets]         = useState([]);
  const [navHistory, setNavHistory] = useState([]);
  const [loading, setLoading]       = useState(false);

  const fundRead = new Contract(FUND_ADDRESS, FUND_ABI, readProvider);
  const usdcRead = new Contract(USDC_ADDRESS, USDC_ABI, readProvider);

  const refresh = useCallback(async () => {
    if (FUND_ADDRESS === "0x0000000000000000000000000000000000000000") return;
    setLoading(true);
    try {
      // Fund-level info
      const info     = await fundRead.getFundInfo();
      const subFee   = await fundRead.subscriptionFeeBps();
      const redFee   = await fundRead.redemptionFeeBps();
      const assetArr = await fundRead.getAssets();

      const weightArr = await Promise.all(
        assetArr.map((a) => fundRead.weights(a))
      );

      setFundInfo({
        nav:         Number(info[0]) / 1e6,
        totalSupply: parseFloat(formatUnits(info[1], 18)),
        totalAUM:    Number(info[2]) / 1e6,
        lastNav:     Number(info[3]),
        lastRebal:   Number(info[4]),
        usdcBalance: Number(info[5]) / 1e6,
        subFeeBps:   Number(subFee),
        redFeeBps:   Number(redFee),
      });

      setAssets(
        assetArr.map((name, i) => ({
          name,
          weight: Number(weightArr[i]) / 100, // bps → %
        }))
      );

      // User info
      if (address) {
        const tokenBal = await fundRead.balanceOf(address);
        const usdcBal  = await usdcRead.balanceOf(address);
        const usdcAllow = await usdcRead.allowance(address, FUND_ADDRESS);
        setUserInfo({
          tokenBalance: parseFloat(formatUnits(tokenBal, 18)),
          usdcBalance:  Number(usdcBal) / 1e6,
          usdcAllowance: Number(usdcAllow) / 1e6,
        });
      }

      // NAV history from events (last 200 blocks)
      const filter  = fundRead.filters.NAVUpdated();
      const latest  = await readProvider.getBlockNumber();
      const events  = await fundRead.queryFilter(filter, Math.max(0, latest - 50000), latest);
      const history = events.map((e) => ({
        time:  new Date(Number(e.args[2]) * 1000).toLocaleDateString(),
        nav:   Number(e.args[0]) / 1e6,
        aum:   Number(e.args[1]) / 1e6,
      }));
      if (history.length > 0) setNavHistory(history);

    } catch (err) {
      console.error("useFund refresh:", err);
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => { refresh(); }, [refresh]);

  // ── Gas override for Polygon Amoy (min 25 gwei tip) ─────────────────────
  const GAS_OPTS = {
    maxFeePerGas:         BigInt(50_000_000_000),  // 50 gwei
    maxPriorityFeePerGas: BigInt(30_000_000_000),  // 30 gwei
  };

  // ── Write helpers (need signer) ───────────────────────────────────────────
  const subscribe = useCallback(async (usdcAmount) => {
    if (!signer) throw new Error("Connect wallet first");
    const fundW = new Contract(FUND_ADDRESS, FUND_ABI, signer);
    const usdcW = new Contract(USDC_ADDRESS, USDC_ABI, signer);
    const amt   = BigInt(Math.floor(usdcAmount * 1e6));
    const allow = await usdcRead.allowance(address, FUND_ADDRESS);
    if (allow < amt) {
      const tx = await usdcW.approve(FUND_ADDRESS, amt, GAS_OPTS);
      await tx.wait();
    }
    const tx = await fundW.subscribe(amt, GAS_OPTS);
    await tx.wait();
    await refresh();
  }, [signer, address, refresh]);

  const redeem = useCallback(async (tokenAmount) => {
    if (!signer) throw new Error("Connect wallet first");
    const fundW = new Contract(FUND_ADDRESS, FUND_ABI, signer);
    const amt   = BigInt(Math.floor(tokenAmount * 1e18));
    const tx    = await fundW.redeem(amt, GAS_OPTS);
    await tx.wait();
    await refresh();
  }, [signer, refresh]);

  const faucet = useCallback(async () => {
    if (!signer) throw new Error("Connect wallet first");
    const usdcW = new Contract(USDC_ADDRESS, USDC_ABI, signer);
    const tx    = await usdcW.faucet(GAS_OPTS);
    await tx.wait();
    await refresh();
  }, [signer, refresh]);

  // ── Add tokens to MetaMask ────────────────────────────────────────────────
  const addTokensToMetaMask = useCallback(async () => {
    if (!window.ethereum) return;
    await window.ethereum.request({
      method: "wallet_watchAsset",
      params: { type: "ERC20", options: {
        address: FUND_ADDRESS,
        symbol:  "M7F",
        decimals: 18,
      }},
    });
    await window.ethereum.request({
      method: "wallet_watchAsset",
      params: { type: "ERC20", options: {
        address: USDC_ADDRESS,
        symbol:  "USDC",
        decimals: 6,
      }},
    });
  }, []);

  const previewSubscribe = useCallback(async (usdcAmount) => {
    const amt = BigInt(Math.floor(usdcAmount * 1e6));
    const res = await fundRead.previewSubscribe(amt);
    return {
      tokensOut:   parseFloat(formatUnits(res.tokensOut, 18)),
      feeCharged:  Number(res.feeCharged) / 1e6,
    };
  }, []);

  const previewRedeem = useCallback(async (tokenAmount) => {
    const amt = BigInt(Math.floor(tokenAmount * 1e18));
    const res = await fundRead.previewRedeem(amt);
    return {
      usdcOut:    Number(res.usdcOut) / 1e6,
      feeCharged: Number(res.feeCharged) / 1e6,
    };
  }, []);

  return {
    fundInfo, userInfo, assets, navHistory,
    loading, refresh,
    subscribe, redeem, faucet,
    previewSubscribe, previewRedeem,
    addTokensToMetaMask,
  };
}
