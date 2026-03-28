import { useState, useCallback } from "react";
import { BrowserProvider } from "ethers";
import { CHAIN_ID, CHAIN_NAME, RPC_URL } from "../constants/contracts.js";

export function useWallet() {
  const [provider, setProvider]   = useState(null);
  const [signer, setSigner]       = useState(null);
  const [address, setAddress]     = useState("");
  const [error, setError]         = useState("");

  const connect = useCallback(async () => {
    setError("");
    if (!window.ethereum) {
      setError("MetaMask not found. Please install it.");
      return;
    }
    try {
      const _provider = new BrowserProvider(window.ethereum);
      await _provider.send("eth_requestAccounts", []);

      // Switch / add Polygon Amoy
      try {
        await window.ethereum.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: "0x" + CHAIN_ID.toString(16) }],
        });
      } catch (switchErr) {
        if (switchErr.code === 4902) {
          await window.ethereum.request({
            method: "wallet_addEthereumChain",
            params: [{
              chainId: "0x" + CHAIN_ID.toString(16),
              chainName: CHAIN_NAME,
              nativeCurrency: { name: "MATIC", symbol: "MATIC", decimals: 18 },
              rpcUrls: [RPC_URL],
              blockExplorerUrls: ["https://amoy.polygonscan.com"],
            }],
          });
        }
      }

      const _signer = await _provider.getSigner();
      setProvider(_provider);
      setSigner(_signer);
      setAddress(await _signer.getAddress());
    } catch (err) {
      setError(err.message || "Connection failed");
    }
  }, []);

  const disconnect = useCallback(() => {
    setProvider(null);
    setSigner(null);
    setAddress("");
  }, []);

  return { provider, signer, address, error, connect, disconnect };
}
