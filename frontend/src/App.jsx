import { useWallet }    from "./hooks/useWallet.js";
import { useFund }      from "./hooks/useFund.js";
import Header           from "./components/Header.jsx";
import StatCard         from "./components/StatCard.jsx";
import NAVChart         from "./components/NAVChart.jsx";
import WeightsChart     from "./components/WeightsChart.jsx";
import UserPosition     from "./components/UserPosition.jsx";
import SubscribeForm    from "./components/SubscribeForm.jsx";
import RedeemForm       from "./components/RedeemForm.jsx";
import styles           from "./App.module.css";

export default function App() {
  const wallet = useWallet();
  const fund   = useFund(wallet.signer, wallet.address);

  const { fundInfo, userInfo, assets, navHistory, loading, liveNavLoading } = fund;

  const fmtDate = (ts) =>
    ts ? new Date(ts * 1000).toLocaleString() : "Never";

  return (
    <div className={styles.root}>
      <Header
        address={wallet.address}
        onConnect={wallet.connect}
        onDisconnect={wallet.disconnect}
      />

      {wallet.error && (
        <div className={styles.errorBanner}>{wallet.error}</div>
      )}

      <main className={styles.main}>
        {/* ── Fund overview stats ── */}
        <section className={styles.statsRow}>
          <StatCard
            label="NAV / Token"
            value={liveNavLoading ? "⏳ Loading..." : fundInfo ? `$${fundInfo.nav.toFixed(4)}` : "—"}
            sub="USDC per M7F"
            highlight
          />
          <StatCard
            label="Total AUM"
            value={fundInfo ? `$${fundInfo.totalAUM.toLocaleString("en", { maximumFractionDigits: 2 })}` : "—"}
            sub="USDC"
          />
          <StatCard
            label="Tokens Issued"
            value={fundInfo ? fundInfo.totalSupply.toFixed(4) : "—"}
            sub="M7F"
          />
          <StatCard
            label="Fund Return"
            value={liveNavLoading ? "⏳ Loading..." : fundInfo ? `${((fundInfo.nav / 100 - 1) * 100).toFixed(2)}%` : "—"}
            sub={`vs $100 initial`}
          />
        </section>

        {/* ── Charts row ── */}
        <section className={styles.chartsRow}>
          <NAVChart history={navHistory} />
          <WeightsChart assets={assets} />
        </section>

        {/* ── Bottom row: position + trade forms ── */}
        <section className={styles.bottomRow}>
          {wallet.address ? (
            <UserPosition
              userInfo={userInfo}
              fundInfo={fundInfo}
              onFaucet={fund.faucet}
              onAddTokens={fund.addTokensToMetaMask}
            />
          ) : (
            <div className={styles.connectPrompt}>
              <p>Connect your wallet to view your position and trade</p>
              <button className={styles.connectBtn} onClick={wallet.connect}>
                Connect Wallet
              </button>
            </div>
          )}

          <SubscribeForm
            userInfo={userInfo}
            fundInfo={fundInfo}
            onSubscribe={fund.subscribe}
            onPreview={fund.previewSubscribe}
          />

          <RedeemForm
            userInfo={userInfo}
            fundInfo={fundInfo}
            onRedeem={fund.redeem}
            onPreview={fund.previewRedeem}
          />
        </section>

        {/* ── Meta info ── */}
        <section className={styles.metaRow}>
          <div className={styles.metaItem}>
            <span className={styles.metaLabel}>Last NAV update</span>
            <span className={styles.metaVal}>{fmtDate(fundInfo?.lastNav)}</span>
          </div>
          <div className={styles.metaItem}>
            <span className={styles.metaLabel}>Last rebalance</span>
            <span className={styles.metaVal}>{fmtDate(fundInfo?.lastRebal)}</span>
          </div>
          <div className={styles.metaItem}>
            <span className={styles.metaLabel}>Token</span>
            <span className={styles.metaVal}>MAG7 Fund (M7F)</span>
          </div>
          <div className={styles.metaItem}>
            <span className={styles.metaLabel}>Network</span>
            <span className={styles.metaVal}>Polygon Amoy (chainId 80002)</span>
          </div>
        </section>
      </main>

      {loading && <div className={styles.loadingBar} />}
    </div>
  );
}
