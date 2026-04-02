exports.handler = async () => {
  const API_KEY    = process.env.ALPACA_API_KEY;
  const API_SECRET = process.env.ALPACA_SECRET_KEY;
  const BASE_URL   = "https://paper-api.alpaca.markets/v2";

  const headers = {
    "APCA-API-KEY-ID":     API_KEY,
    "APCA-API-SECRET-KEY": API_SECRET,
  };

  const cors = {
    "Access-Control-Allow-Origin":  "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type":                 "application/json",
  };

  try {
    const [accountRes, positionsRes, historyRes] = await Promise.all([
      fetch(`${BASE_URL}/account`,   { headers }),
      fetch(`${BASE_URL}/positions`, { headers }),
      fetch(`${BASE_URL}/account/portfolio/history?period=1M&timeframe=1D`, { headers }),
    ]);

    if (!accountRes.ok) {
      throw new Error(`Alpaca account error: ${accountRes.status}`);
    }

    const account   = await accountRes.json();
    const positions = await positionsRes.json();
    const history   = historyRes.ok ? await historyRes.json() : null;

    const posData = Array.isArray(positions)
      ? positions.map((p) => ({
          symbol:         p.symbol,
          qty:            parseFloat(p.qty),
          market_value:   parseFloat(p.market_value),
          current_price:  parseFloat(p.current_price),
          unrealized_pl:  parseFloat(p.unrealized_pl),
          unrealized_plpc: parseFloat(p.unrealized_plpc),
        }))
      : [];

    return {
      statusCode: 200,
      headers:    cors,
      // 把 portfolio history 轉成 { time, nav } 格式
      const navHistory = [];
      if (history && Array.isArray(history.timestamp)) {
        history.timestamp.forEach((ts, i) => {
          const equity = history.equity[i];
          if (equity && equity > 0) {
            navHistory.push({
              time: new Date(ts * 1000).toLocaleDateString(),
              nav:  (equity / 100_000) * 100,
            });
          }
        });
      }

      body: JSON.stringify({
        equity:     parseFloat(account.equity),
        cash:       parseFloat(account.cash),
        positions:  posData,
        navHistory: navHistory,
        timestamp:  Date.now(),
      }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers:    cors,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
