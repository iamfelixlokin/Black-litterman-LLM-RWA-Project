import styles from "./UserPosition.module.css";
import panelStyles from "./Panel.module.css";

export default function UserPosition({ userInfo, fundInfo, displayNav, onFaucet, onAddTokens }) {
  if (!userInfo) return null;

  const nav      = displayNav ?? fundInfo?.nav ?? 100;
  const tokenVal = userInfo.tokenBalance * nav;
  const pnlPct   = ((nav / 100 - 1) * 100).toFixed(2);
  const pnlAmt   = userInfo.tokenBalance * (nav - 100);
  const isPos    = parseFloat(pnlPct) >= 0;

  return (
    <div className={panelStyles.panel}>
      <h3 className={panelStyles.title}>My Position</h3>
      <div className={styles.grid}>
        <div className={styles.item}>
          <span className={styles.label}>M7F Balance</span>
          <span className={styles.val}>{userInfo.tokenBalance.toFixed(6)}</span>
        </div>
        <div className={styles.item}>
          <span className={styles.label}>Position Value</span>
          <span className={styles.val}>${tokenVal.toFixed(2)}</span>
        </div>
        <div className={styles.item}>
          <span className={styles.label}>USDC Balance</span>
          <span className={styles.val}>${userInfo.usdcBalance.toFixed(2)}</span>
        </div>
        <div className={styles.item}>
          <span className={styles.label}>My Return</span>
          <span className={`${styles.val} ${isPos ? styles.green : styles.red}`}>
            {isPos ? "+" : ""}{pnlPct}%
          </span>
          <span className={`${styles.pnlAmt} ${isPos ? styles.green : styles.red}`}>
            {isPos ? "+" : ""}${pnlAmt.toFixed(2)}
          </span>
        </div>
      </div>
      <button className={styles.faucetBtn} onClick={onFaucet}>
        + Get 100,000 test USDC
      </button>
    </div>
  );
}
