import styles from "./StatCard.module.css";

export default function StatCard({ label, value, sub, highlight, positive, negative }) {
  const valueClass = [
    styles.value,
    positive ? styles.positive : "",
    negative ? styles.negative : "",
  ].join(" ");

  return (
    <div className={`${styles.card} ${highlight ? styles.highlight : ""}`}>
      <span className={styles.label}>{label}</span>
      <span className={valueClass}>{value ?? "—"}</span>
      {sub && <span className={styles.sub}>{sub}</span>}
    </div>
  );
}
