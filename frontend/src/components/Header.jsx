import styles from "./Header.module.css";

export default function Header({ address, onConnect, onDisconnect }) {
  const short = address
    ? `${address.slice(0, 6)}…${address.slice(-4)}`
    : null;

  return (
    <header className={styles.header}>
      <div className={styles.logo}>
        <span className={styles.logoIcon}>◈</span>
        <span className={styles.logoText}>MAG7 Fund</span>
        <span className={styles.badge}>Polygon Amoy</span>
      </div>
      <div className={styles.right}>
        {short ? (
          <div className={styles.walletRow}>
            <span className={styles.dot} />
            <span className={styles.addr}>{short}</span>
            <button className={styles.btnGhost} onClick={onDisconnect}>Disconnect</button>
          </div>
        ) : (
          <button className={styles.btnConnect} onClick={onConnect}>
            Connect Wallet
          </button>
        )}
      </div>
    </header>
  );
}
