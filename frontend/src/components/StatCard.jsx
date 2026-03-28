import styles from "./StatCard.module.css";

export default function StatCard({ label, value, sub, highlight }) {
  return (
    <div className={`${styles.card} ${highlight ? styles.highlight : ""}`}>
      <span className={styles.label}>{label}</span>
      <span className={styles.value}>{value ?? "—"}</span>
      {sub && <span className={styles.sub}>{sub}</span>}
    </div>
  );
}
