import { useState, useEffect } from "react";
import styles from "./TradeForm.module.css";
import panelStyles from "./Panel.module.css";

export default function RedeemForm({ userInfo, fundInfo, onRedeem, onPreview }) {
  const [amount, setAmount]   = useState("");
  const [preview, setPreview] = useState(null);
  const [busy, setBusy]       = useState(false);
  const [msg, setMsg]         = useState("");

  useEffect(() => {
    if (!amount || isNaN(amount) || parseFloat(amount) <= 0) {
      setPreview(null);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const p = await onPreview(parseFloat(amount));
        setPreview(p);
      } catch { setPreview(null); }
    }, 400);
    return () => clearTimeout(t);
  }, [amount, onPreview]);

  const handleMax = () => setAmount(String(userInfo?.tokenBalance?.toFixed(6) ?? ""));

  const handleSubmit = async () => {
    setMsg("");
    if (!amount || parseFloat(amount) <= 0) return;
    setBusy(true);
    try {
      await onRedeem(parseFloat(amount));
      setMsg("✓ Redeemed successfully!");
      setAmount("");
      setPreview(null);
    } catch (err) {
      setMsg("✗ " + (err.reason || err.message || "Transaction failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={panelStyles.panel}>
      <h3 className={panelStyles.title}>Redeem</h3>

      <div className={styles.inputRow}>
        <input
          className={styles.input}
          type="number"
          placeholder="M7F token amount"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <button className={styles.maxBtn} onClick={handleMax}>MAX</button>
      </div>

      {preview && (
        <div className={styles.preview}>
          <div className={styles.previewRow}>
            <span>You receive</span>
            <span className={styles.accent}>${preview.usdcOut.toFixed(4)} USDC</span>
          </div>
          <div className={styles.previewRow}>
            <span>Fee ({fundInfo?.redFeeBps / 100 ?? 0.5}%)</span>
            <span>${preview.feeCharged.toFixed(4)}</span>
          </div>
          <div className={styles.previewRow}>
            <span>Current NAV</span>
            <span>${fundInfo?.nav?.toFixed(4) ?? "—"}</span>
          </div>
        </div>
      )}

      <button
        className={styles.btn}
        onClick={handleSubmit}
        disabled={busy || !amount}
      >
        {busy ? "Processing…" : "Redeem"}
      </button>

      {msg && (
        <p className={`${styles.msg} ${msg.startsWith("✓") ? styles.ok : styles.err}`}>
          {msg}
        </p>
      )}
    </div>
  );
}
