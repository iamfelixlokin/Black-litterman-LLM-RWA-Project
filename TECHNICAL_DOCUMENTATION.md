# MAG7 Fund：技術文檔

> **Black-Litterman + LLM 量化策略 RWA 基金**
> 版本 1.0 ｜ 2026年3月

---

## 目錄

1. [專案概覽](#1-專案概覽)
2. [系統架構](#2-系統架構)
3. [Black-Litterman 模型](#3-black-litterman-模型)
4. [LLM 觀點生成](#4-llm-觀點生成)
5. [資料收集層](#5-資料收集層)
6. [回測框架](#6-回測框架)
7. [智能合約](#7-智能合約)
8. [Oracle 服務](#8-oracle-服務)
9. [Alpaca 模擬交易](#9-alpaca-模擬交易)
10. [前端應用](#10-前端應用)
11. [自動化排程](#11-自動化排程)
12. [回測結果](#12-回測結果)
13. [技術決策說明](#13-技術決策說明)
14. [部署指南](#14-部署指南)

---

## 1. 專案概覽

### 1.1 核心理念

MAG7 Fund 是一個結合量化金融與區塊鏈技術的 RWA（Real World Asset）基金系統，針對 Magnificent 7 科技股（AAPL、MSFT、GOOGL、AMZN、NVDA、TSLA、META）進行投資組合最適化。

系統的核心創新在於：

- **Black-Litterman 模型**：結合市場均衡報酬與主觀觀點，解決 Markowitz 模型對輸入過度敏感的問題
- **Claude LLM 觀點**：利用大型語言模型分析近期市場動態，生成相對績效預測，取代傳統人工觀點輸入
- **鏈上透明度**：NAV（單位資產淨值）與持倉權重即時記錄於 Polygon Amoy 區塊鏈，任何人可公開驗證
- **全自動化**：GitHub Actions 每月自動執行重平衡，無需人工干預

### 1.2 投資標的

| 代碼 | 公司 |
|------|------|
| AAPL | Apple Inc. |
| MSFT | Microsoft Corporation |
| NVDA | NVIDIA Corporation |
| GOOGL | Alphabet Inc. |
| AMZN | Amazon.com Inc. |
| META | Meta Platforms Inc. |
| TSLA | Tesla Inc. |


### 1.3 代幣資訊

| 項目 | 數值 |
|------|------|
| 代幣名稱 | MAG7 Fund |
| 代幣符號 | M7F |
| 小數位 | 18 |
| 可轉移性 | **不可轉移（Soulbound）** |
| 初始 NAV | $100.00 USDC |
| 申購費 | 0.5%（50 bps） |
| 贖回費 | 0.5%（50 bps） |
| 最低申購 | $10.00 USDC |
| 部署網路 | Polygon Amoy（測試網） |

---

## 2. 系統架構

### 2.1 高層架構

```
┌─────────────────────────────────────────────────────────────────┐
│                         策略層（Python）                         │
│                                                                   │
│  ┌─────────────────┐    ┌──────────────────┐    ┌─────────────┐ │
│  │  DataCollector  │ →  │ LLMViewGenerator │ →  │     BL      │ │
│  │  (yfinance API) │    │  (Claude Sonnet) │    │    Model    │ │
│  └─────────────────┘    └──────────────────┘    └─────────────┘ │
└───────────────────────────────────┬─────────────────────────────┘
                                    │ 最適化權重 (bps)
┌───────────────────────────────────▼─────────────────────────────┐
│                         Oracle 層（Python）                       │
│                                                                   │
│  ┌─────────────────┐    ┌──────────────────┐    ┌─────────────┐ │
│  │  NAVCalculator  │    │  AlpacaTrader    │    │   Oracle    │ │
│  │  (計算新 NAV)   │ ←  │  (模擬倉 NAV)    │    │   Service   │ │
│  └─────────────────┘    └──────────────────┘    └──────┬──────┘ │
└──────────────────────────────────────────────────────────────────┘
                                                          │ 簽署交易
┌─────────────────────────────────────────────────────────▼────────┐
│                      區塊鏈層（Polygon Amoy）                     │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────────┐│
│  │                    RWAFund.sol                                ││
│  │  updateNAV(newNAV, totalAUM)   updateRebalance(assets, bps)  ││
│  │  subscribe(usdcAmount)          redeem(tokenAmount)           ││
│  └──────────────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────────┘
                                    │
                           ┌────────▼────────┐
                           │   前端（React）   │
                           │  Netlify 部署    │
                           │  即時 NAV 顯示   │
                           └─────────────────┘
```

### 2.2 資料流向

```
每月 1 號 09:30 UTC（GitHub Actions 自動觸發）
          │
          ▼
[1] 抓取最近 12 個月股價數據（252 個交易日，yfinance）
          │
          ▼
[2] 為每檔股票準備 LLM 上下文
    - 7日、30日、60日相對 Alpha（vs SPY）
    - 趨勢方向（加速/減速/穩定）
    - 相對強度分類
          │
          ▼
[3] Claude Sonnet 生成 7 個觀點
    - 預期報酬（%）
    - 信心度（high/medium/low）
          │
          ▼
[4] BL 模型計算
    - 市場隱含報酬（逆向最適化）
    - 後驗報酬（融合觀點）
    - 均值-變異數最適化 → 最終權重
          │
          ▼
[5] Alpaca 模擬倉調倉
    - 按新權重提交 7 筆市場訂單
          │
          ▼
[6] Oracle 簽署並提交鏈上交易
    - updateRebalance(assets, weightsBps)
    - updateNAV(newNAV, totalAUM)
          │
          ▼
[7] 前端讀取合約 + 每 30 秒從 Netlify Function 更新 NAV
```

---

## 3. Black-Litterman 模型

### 3.1 原理說明

Black-Litterman（1990）模型解決了 Markowitz 均值-變異數最適化的兩大問題：
1. **對輸入極度敏感**：預期報酬的微小變化導致權重大幅波動
2. **corner solution**：傳統 MVO 常產生集中且不直觀的投資組合

BL 的核心思想是從**市場均衡**出發，再將主觀觀點融入，得到更穩定的後驗報酬估計。

### 3.2 數學框架

**步驟一：計算市場隱含均衡報酬（逆向最適化）**

```
Π = δ × Σ × w_market

其中：
  Π      = 均衡報酬向量（n×1）
  δ      = 風險厭惡係數（Oracle: 1.8，回測: 2.5）
  Σ      = 資產協方差矩陣（n×n）
  w_market = 市值加權向量（n×1）
```

**步驟二：定義主觀觀點（LLM 提供）**

```
P × R = Q + ε,  ε ~ N(0, Ω)

其中：
  P = 觀點矩陣（k×n），k 個觀點，n 個資產
  Q = 預期報酬向量（k×1）
  Ω = 觀點不確定性矩陣（k×k 對角矩陣）
```

本系統採用**混合型觀點**：LLM 生成的是**相對績效觀點**（Alpha vs SPY），但在 BL 格式中以絕對觀點形式實作。P 矩陣為 one-hot 向量（每行只有一個 1），Q 向量存放 LLM 預測的 Alpha 值。

> **注意**：嚴格的「相對觀點」應在 P 矩陣中同時包含 +1（該股票）和 -1（SPY），但本系統簡化為 one-hot 格式，將 Alpha 值直接作為 Q 輸入。

**步驟三：計算後驗報酬**

```
E[R] = Π + τΣP'[PτΣP' + Ω]⁻¹(Q - PΠ)

Σ_post = Σ + τΣ - τΣP'[PτΣP' + Ω]⁻¹PτΣ

其中：
  τ = 先驗不確定性縮放因子（Oracle: 0.15，回測: 0.025）
```

**步驟四：均值-變異數最適化**

```
max  w'E[R] - (δ/2) × w'Σ_post × w

s.t. Σwᵢ = 1
     0.05 ≤ wᵢ ≤ 0.30  （頭寸限制）
```

使用 SciPy SLSQP 演算法求解。

### 3.3 關鍵參數選擇

| 參數 | Oracle 值 | 回測值 | 說明 |
|------|-----------|--------|------|
| `risk_aversion` (δ) | 1.8 | 2.5 | 較低值 → 更積極押注 LLM 觀點 |
| `tau` (τ) | 0.15 | 0.025 | 較高值 → 觀點權重更高（相對市場先驗） |
| `min_weight` | 5% | 5% | 避免 zero-weight corner solution |
| `max_weight` | 30% | 30% | 防止過度集中 |

**設計考量**：Oracle 使用較高的 tau（0.15）代表我們對 LLM 觀點有較高的信任度，讓每月生成的權重更能反映 Claude 的市場判斷。

### 3.4 協方差矩陣估計

支援三種方法：

```python
# 方法一：樣本協方差（基準）
cov = returns.cov() * 252

# 方法二：Ledoit-Wolf 縮減（推薦）
# 縮向常數相關性矩陣，解決有限樣本的估計誤差
target = constant_correlation_target(returns)
cov = (1 - shrinkage) * sample_cov + shrinkage * target

# 方法三：指數加權（近期數據權重更高）
cov = returns.ewm(halflife=60).cov().iloc[-7:] * 252
```

---

## 4. LLM 觀點生成

### 4.1 設計原則

使用 Anthropic **Claude Sonnet 4（`claude-sonnet-4-20250514`）** 作為量化分析師，生成每月股票的相對績效預測。關鍵設計決策：

- **分析相對報酬，非絕對報酬**：要求 LLM 預測 Alpha（vs SPY），避免對整體市場方向進行判斷
- **低溫度（0.3）**：降低隨機性，提升一致性
- **嚴格 JSON 格式**：確保輸出可被機器解析
- **無前瞻偏差**：LLM 上下文只包含分析日期之前的數據

### 4.2 上下文準備

每檔股票的 LLM 輸入包含以下結構化資訊：

```
TICKER: AAPL
Analysis Date: 2026-03-01

RELATIVE PERFORMANCE vs SPY:
  7-day Alpha:  +2.3%   (Moderate Outperform)
  30-day Alpha: +5.1%   (Strong Outperform)
  60-day Alpha: +8.7%   (Strong Outperform)
  Alpha Trend:  ACCELERATING

ABSOLUTE METRICS:
  30-day return:    +12.4%
  30-day volatility: 24.1% annualized
  Price trend:       STRONG_UP (RSI: 68.2)
```

### 4.3 觀點生成流程

```python
# 系統提示強調：
system_prompt = """
你是量化基金分析師，專注分析 Magnificent 7 股票。
你的任務：預測每檔股票未來 30 天相對 S&P 500 的超額報酬（Alpha）。

輸出格式（JSON）：
{
  "ticker": "AAPL",
  "expected_return": 5.5,    // Alpha %，範圍 -10% 到 +10%
  "confidence": "medium",    // high / medium / low
  "reasoning": "...",
  "key_factors": [...]
}
"""
```

### 4.4 信心度映射到 Omega

信心度決定觀點在 BL 模型中的權重：

```python
confidence_omega = {
    "high":   0.15,   # Ω = 0.15 × (τ × P × Σ × P')  → 觀點影響力大
    "medium": 0.50,   # Ω = 0.50 × (τ × P × Σ × P')  → 標準影響力
    "low":    2.00,   # Ω = 2.00 × (τ × P × Σ × P')  → 影響力小
}
```

較小的 Omega → 更確定的觀點 → BL 後驗更靠近 Q（LLM 預測）
較大的 Omega → 更不確定的觀點 → BL 後驗更靠近 Π（市場均衡）

### 4.5 防禦性設計

```python
# 極端值裁剪（避免 LLM 幻覺導致不合理權重）
if abs(expected_return) > 0.20:
    expected_return = np.sign(expected_return) * 0.20

# 批次生成失敗時的降級策略
# → 所有觀點設為 0，退化為純市場均衡權重
```

---

## 5. 資料收集層

### 5.1 價格資料

```python
# 使用 yfinance 批次下載
data = yf.download(
    tickers=["AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "TSLA", "META", "SPY"],
    start=start_date,
    end=end_date,
    interval="1d",
    auto_adjust=True    # 自動調整股息和股票分割
)
```

Oracle 每月使用最近 **12 個月（252 個交易日）** 的滾動窗口，確保模型始終反映當前市場環境。

### 5.2 無前瞻偏差機制

```python
def prepare_llm_context(ticker, date, price_history, lookback_days=60):
    """
    嚴格只使用 date 之前的數據
    避免用未來資訊訓練或評估模型
    """
    # 過濾：只使用 date 之前的數據
    historical = price_history[price_history.index < date]

    # 計算相對績效（Alpha）
    stock_ret = historical[ticker].pct_change()
    spy_ret = historical["SPY"].pct_change()
    alpha_30d = (1 + stock_ret).tail(30).prod() - (1 + spy_ret).tail(30).prod()
    ...
```

---

## 6. 回測框架

### 6.1 設計原則

- **月度重平衡**：每月第一個交易日重新計算並調整權重
- **交易成本模型**：10 bps 佣金 + 5 bps 滑點，依換手率計算
- **頭寸限制**：5% ≤ 每檔資產權重 ≤ 30%
- **無前瞻偏差**：`ensure_no_lookahead()` 確保每次重平衡只用歷史數據

### 6.2 策略對比

```python
# 四種策略同時回測比較
strategies = {
    "black_litterman": run_bl_backtest(llm_generator),   # 主策略
    "markowitz":       run_markowitz_backtest(),           # 純 MVO 基準
    "equal_weight":    run_equal_weight_backtest(),        # 1/N 基準
    "spy":             run_benchmark_backtest(),           # 市場基準
}
```

### 6.3 回測參數

| 參數 | 值 |
|------|-----|
| 回測期間 | 2015-01-01 至 2025-12-31（約 10 年） |
| 有效回測起點 | 2016-01-01（扣除 252 日歷史回顧期） |
| 初始資本 | $1,000,000 |
| 歷史回顧期 | 252 個交易日 |
| 重平衡頻率 | 每月 |
| 交易成本 | 10 bps（0.001） |
| 滑點 | 5 bps（0.0005） |
| 無風險利率 | 4.0% |

---

## 7. 智能合約

### 7.1 合約概覽

```
RWAFund.sol
繼承：ERC20, AccessControl, Pausable, ReentrancyGuard
```

### 7.2 Soulbound 代幣機制

代幣不可在地址間轉移，強制所有流動性透過基金本身進行：

```solidity
// 所有轉移操作全部 revert
function transfer(address, uint256) public pure override returns (bool) {
    revert("M7F: token is soulbound");
}

function transferFrom(address, address, uint256) public pure override returns (bool) {
    revert("M7F: token is soulbound");
}

function approve(address, uint256) public pure override returns (bool) {
    revert("M7F: token is soulbound");
}
```

### 7.3 申購機制

```solidity
function subscribe(uint256 usdcAmount) external nonReentrant whenNotPaused {
    require(usdcAmount >= MIN_SUBSCRIPTION, "Below minimum");

    // 計算費用
    uint256 fee = (usdcAmount * subscriptionFeeBps) / 10_000;
    uint256 netAmount = usdcAmount - fee;

    // 轉入 USDC
    usdc.transferFrom(msg.sender, address(this), usdcAmount);
    usdc.transfer(feeCollector, fee);

    // 計算並鑄造代幣
    // tokensOut = (netAmount * 1e18) / navPerToken
    uint256 tokensOut = (netAmount * 1e18) / navPerToken;
    _mint(msg.sender, tokensOut);

    emit Subscribed(msg.sender, usdcAmount, tokensOut);
}
```

### 7.4 贖回機制

```solidity
function redeem(uint256 tokenAmount) external nonReentrant whenNotPaused {
    require(balanceOf(msg.sender) >= tokenAmount, "Insufficient balance");

    // 計算贖回價值
    // usdcGross = (tokenAmount * navPerToken) / 1e18
    uint256 usdcGross = (tokenAmount * navPerToken) / 1e18;

    // 計算費用
    uint256 fee = (usdcGross * redemptionFeeBps) / 10_000;
    uint256 usdcNet = usdcGross - fee;

    // 銷毀代幣並返還 USDC
    _burn(msg.sender, tokenAmount);
    usdc.transfer(feeCollector, fee);
    usdc.transfer(msg.sender, usdcNet);

    emit Redeemed(msg.sender, tokenAmount, usdcNet);
}
```

### 7.5 Oracle 函數

```solidity
// 更新 NAV（每月執行）
function updateNAV(uint256 _newNAV, uint256 _totalAUM)
    external onlyRole(ORACLE_ROLE)
{
    navPerToken = _newNAV;
    totalAUM = _totalAUM;
    lastNavUpdate = block.timestamp;
    emit NAVUpdated(_newNAV, _totalAUM, block.timestamp);
}

// 更新持倉權重（每月執行）
function updateRebalance(
    string[] calldata _assetList,
    uint256[] calldata _weights    // 單位：bps，總和 = 10,000
) external onlyRole(ORACLE_ROLE)
{
    // 驗證權重總和
    uint256 totalWeight = 0;
    for (uint256 i = 0; i < _weights.length; i++) {
        totalWeight += _weights[i];
    }
    require(totalWeight == 10_000, "Weights must sum to 10000 bps");

    // 清除舊權重並設定新權重
    for (uint256 i = 0; i < _assets.length; i++) {
        delete weights[_assets[i]];
    }
    delete _assets;
    for (uint256 i = 0; i < _assetList.length; i++) {
        _assets.push(_assetList[i]);
        weights[_assetList[i]] = _weights[i];
    }
    emit RebalanceUpdated(_assetList, _weights);
}
```

### 7.6 角色權限

| 角色 | 功能 |
|------|------|
| `DEFAULT_ADMIN_ROLE` | 授予/撤銷所有角色 |
| `MANAGER_ROLE` | 暫停合約、設定費率、緊急提款 |
| `ORACLE_ROLE` | 更新 NAV 和持倉權重 |

---

## 8. Oracle 服務

### 8.1 流程概覽

```python
class OracleService:
    def run_rebalance(self):
        # 1. 執行 BL 計算
        calc = NAVCalculator(tickers, fund_contract, anthropic_key)
        assets, weight_bps = calc.compute_rebalance_weights()

        # 2. Alpaca 調倉
        if self.alpaca_trader:
            target_weights = {
                asset: bps / 10_000
                for asset, bps in zip(assets, weight_bps)
            }
            self.alpaca_trader.rebalance(target_weights)

        # 3. 提交鏈上交易
        tx = self._send_tx(
            self.fund.functions.updateRebalance(assets, weight_bps),
            gas=400_000
        )

        # 4. 更新 NAV
        self.run_nav_update()
        return tx
```

### 8.2 交易簽署

```python
def _send_tx(self, fn, gas, retries=3):
    for attempt in range(retries):
        try:
            tx = fn.build_transaction({
                "from": self.account.address,
                "nonce": self.w3.eth.get_transaction_count(self.account.address),
                "gas": gas,
                "maxFeePerGas": self.w3.to_wei(50, "gwei"),
                "maxPriorityFeePerGas": self.w3.to_wei(30, "gwei"),  # Polygon Amoy 要求最低 25 gwei
            })
            signed = self.account.sign_transaction(tx)
            tx_hash = self.w3.eth.send_raw_transaction(signed.raw_transaction)
            receipt = self.w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)
            return receipt.transactionHash.hex()
        except Exception as e:
            if attempt == retries - 1:
                raise
            time.sleep(2 ** attempt)  # 指數退避
```

### 8.3 NAV 計算邏輯

```
NAV 計算方式（Alpaca 模式）：

initial_capital = $100,000（Alpaca 帳戶初始資金）
current_equity  = Alpaca 帳戶現在的市值

nav_per_token = 100.0 × (current_equity / initial_capital)

範例：
  若 Alpaca 帳戶增長至 $110,000
  nav_per_token = 100.0 × (110,000 / 100,000) = $110.00
```

---

## 9. Alpaca 模擬交易

### 9.1 重平衡邏輯

```python
def rebalance(self, target_weights: Dict[str, float]):
    """
    target_weights: {"AAPL": 0.30, "MSFT": 0.20, ...}  總和 = 1.0
    """
    # 取得帳戶股權和當前持倉
    equity = float(account.equity)
    positions = {p.symbol: float(p.qty) for p in self.api.list_positions()}

    # 計算每檔資產的目標股數
    prices = self._get_latest_prices(list(target_weights.keys()))

    for symbol, target_pct in target_weights.items():
        target_value = equity * target_pct
        target_qty = target_value / prices[symbol]
        current_qty = positions.get(symbol, 0)
        diff = target_qty - current_qty

        if abs(diff * prices[symbol]) < 50:  # 忽略 < $50 的微調
            continue

        side = "buy" if diff > 0 else "sell"
        self._submit_order(symbol, abs(diff), side)
```

### 9.2 訂單執行順序

先賣出過多頭寸 → 等待 2 秒 → 再買入不足頭寸

這個順序確保賣出後有足夠現金執行買入，避免資金不足錯誤。

---

## 10. 前端應用

### 10.1 技術堆棧

| 項目 | 技術 |
|------|------|
| 框架 | React + Vite |
| Web3 | ethers.js v6 |
| 即時 NAV | Netlify Serverless Function |
| 部署 | Netlify（自動從 GitHub 部署） |
| 鏈 | Polygon Amoy（chainId 80002） |

### 10.2 即時 NAV 更新

前端每 30 秒呼叫 Netlify Function，從 Alpaca 取得即時 portfolio 市值：

```javascript
// frontend/netlify/functions/nav.js
exports.handler = async () => {
    const headers = {
        "APCA-API-KEY-ID": process.env.ALPACA_API_KEY,
        "APCA-API-SECRET-KEY": process.env.ALPACA_SECRET_KEY,
    };
    const account = await fetch("https://paper-api.alpaca.markets/v2/account", { headers });
    const positions = await fetch("https://paper-api.alpaca.markets/v2/positions", { headers });

    return {
        statusCode: 200,
        body: JSON.stringify({
            equity: parseFloat(account.equity),
            positions: positions.map(p => ({
                symbol: p.symbol,
                market_value: parseFloat(p.market_value),
                unrealized_pl: parseFloat(p.unrealized_pl),
            })),
        }),
    };
};
```

### 10.3 氣體設定

所有前端交易使用固定的 EIP-1559 氣體參數，以確保在 Polygon Amoy 上順利執行：

```javascript
const GAS_OPTS = {
    maxFeePerGas:         BigInt(50_000_000_000),  // 50 gwei
    maxPriorityFeePerGas: BigInt(30_000_000_000),  // 30 gwei（Amoy 最低要求 25 gwei）
};
```

---

## 11. 自動化排程

### 11.1 GitHub Actions 工作流

```yaml
# .github/workflows/monthly_rebalance.yml
on:
  schedule:
    - cron: "30 9 1 * *"    # 每月 1 號 09:30 UTC
  workflow_dispatch:         # 支援手動觸發

jobs:
  rebalance:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.11"
      - run: pip install -r requirements.txt
      - run: python oracle/oracle_service.py --action rebalance
        env:
          ANTHROPIC_API_KEY:      ${{ secrets.ANTHROPIC_API_KEY }}
          ALCHEMY_RPC_URL:        ${{ secrets.ALCHEMY_RPC_URL }}
          ORACLE_PRIVATE_KEY:     ${{ secrets.ORACLE_PRIVATE_KEY }}
          FUND_CONTRACT_ADDRESS:  ${{ secrets.FUND_CONTRACT_ADDRESS }}
          ALPACA_API_KEY:         ${{ secrets.ALPACA_API_KEY }}
          ALPACA_SECRET_KEY:      ${{ secrets.ALPACA_SECRET_KEY }}
```

### 11.2 必要的 GitHub Secrets

| Secret 名稱 | 說明 |
|-------------|------|
| `ANTHROPIC_API_KEY` | Claude API 鑰（LLM 觀點生成） |
| `ALCHEMY_RPC_URL` | Polygon Amoy RPC 端點 |
| `ORACLE_PRIVATE_KEY` | Oracle 錢包私鑰（需持有 MATIC） |
| `FUND_CONTRACT_ADDRESS` | RWAFund 合約地址 |
| `USDC_CONTRACT_ADDRESS` | MockUSDC 合約地址 |
| `ALPACA_API_KEY` | Alpaca 模擬倉 API Key |
| `ALPACA_SECRET_KEY` | Alpaca 模擬倉 Secret Key |

---

## 12. 回測結果

### 12.1 績效摘要

| 指標（單位） | Black-Litterman | Markowitz | Equal Weight | SPY（基準） |
|-------------|:-:|:-:|:-:|:-:|
| **總報酬（%）** | **+6,052%** | +3,518% | +2,416% | +303% |
| **年化報酬（% / 年）** | **53.28%** | 44.69% | 38.91% | 15.01% |
| **年化波動率（% / 年）** | 32.02% | 31.27% | 28.90% | 18.01% |
| **Sharpe 比（無單位）** | **1.539** | 1.302 | 1.208 | 0.612 |
| **Sortino 比（無單位）** | **2.108** | 1.777 | 1.602 | 0.734 |
| **最大回撤（%）** | -46.41% | -47.24% | -49.38% | -33.72% |
| **Calmar 比（無單位）** | **1.148** | 0.946 | 0.788 | 0.445 |
| **獲勝率—日勝率（%）** | 56.02% | 56.06% | 56.22% | 55.53% |
| **平均月換手率（%）** | 1.99% | 1.04% | 0.04% | 0% |
| **Beta（vs SPY，無單位）** | 0.495 | 0.408 | 0.352 | 1.000 |
| **年化 Alpha（% / 年）** | 87.20% | 72.35% | 62.31% | 0% |

> **單位說明**
> - **%**：百分比報酬或比率
> - **% / 年**：年化數值，基於 252 個交易日換算
> - **無單位**：純比率，數值越高越好（Sharpe、Sortino、Calmar）或依市場方向（Beta）
> - **Sharpe 比** = （年化報酬 − 無風險利率 4%）/ 年化波動率
> - **Sortino 比** = （年化報酬 − 無風險利率 4%）/ 下行標準差
> - **Calmar 比** = 年化報酬 / |最大回撤|
> - **Beta** = 策略與 SPY 的系統性風險敏感度（1.0 = 完全跟隨市場）
> - **Alpha** = CAPM 超額報酬，扣除市場風險後的純策略貢獻

**回測期間**：2015-01-01 至 2025-12-31（約 10 年，有效回測自 2016 年起）

### 12.2 主要發現

1. **Black-Litterman 顯著優於基準**：總報酬 6,052%（約 20 倍於 SPY 的 303%），顯示 Mag7 集中策略 + LLM 觀點的有效性。

2. **風險調整報酬最優**：Sharpe 比 1.539 遠超 SPY（0.612），代表每單位風險獲得了更多報酬。

3. **Alpha 顯著**：年化 Alpha 87.20 bps，遠超交易成本（~15 bps），具備可行的超額報酬來源。

4. **與市場相關性適中**：Beta = 0.489，約 50% 的報酬來自特異性（idiosyncratic）因素，非純粹市場 beta。

5. **換手率合理**：月均換手率 2.01%，對應每月交易成本 ~0.3 bps，在正常範圍內。

---

## 13. 技術決策說明

### 13.1 為何選擇 Polygon Amoy？

- **低氣體費用**：Polygon L2 的交易成本遠低於以太坊主網
- **EVM 相容**：完全相容以太坊工具鏈（Hardhat、ethers.js）
- **測試網 MATIC 免費**：易於開發測試
- **官方測試網**：Polygon 官方支援的測試環境

### 13.2 為何代幣設計為 Soulbound？

- **防止二級市場套利**：避免 NAV 折溢價問題
- **流動性管理**：強制所有流動性透過合約的 subscribe/redeem 機制
- **合規考量**：Soulbound 設計讓代幣不具備流通性，降低證券法規複雜性
- **簡化 NAV 計算**：無需追蹤複雜的轉移歷史

### 13.3 為何選擇 Alpaca Paper Trading？

- **免費**：無需真實資金，適合 RWA 概念驗證
- **真實成交**：模擬倉使用真實市場價格執行，NAV 反映真實市場表現
- **API 友好**：完整 RESTful API，易於整合
- **與 Oracle 一致**：NAV 來源與模擬交易同一個帳戶，不存在價格差異

### 13.4 Oracle 的 tau 參數差異

回測（tau=0.025）vs Oracle（tau=0.15）的差異是刻意設計的：

- **回測（tau=0.025）**：保守設定，遵循學術文獻標準，避免過擬合歷史數據
- **Oracle（tau=0.15）**：積極設定，讓 Claude LLM 的月度觀點對投資組合產生更顯著的影響

若 Oracle 使用與回測相同的 tau，LLM 觀點的影響力會過小，近似於純市場均衡配置。

### 13.5 Netlify Function vs 直接呼叫 Alpaca

直接從前端呼叫 Alpaca API 會暴露 API Key 於瀏覽器（任何人可在 DevTools 看到）。Netlify Function 作為代理層，在伺服器端安全存放並使用金鑰，前端只接收計算後的結果。

---

## 14. 部署指南

### 14.1 環境需求

```bash
# Python 3.11+
pip install -r requirements.txt

# Node.js 18+
npm install

# 環境變數（.env）
ANTHROPIC_API_KEY=sk-ant-...
ALCHEMY_RPC_URL=https://polygon-amoy.g.alchemy.com/v2/...
DEPLOYER_PRIVATE_KEY=...
ORACLE_PRIVATE_KEY=...
FUND_CONTRACT_ADDRESS=0x...
USDC_CONTRACT_ADDRESS=0x...
ALPACA_API_KEY=PK...
ALPACA_SECRET_KEY=...
```

### 14.2 合約部署

```bash
# 編譯
npx hardhat compile

# 部署到 Polygon Amoy
npx hardhat run scripts/deploy.js --network amoy

# 記錄輸出的合約地址到 .env
```

### 14.3 首次執行 Rebalance

```bash
# 手動執行第一次重平衡
python oracle/oracle_service.py --action rebalance

# 或只更新 NAV
python oracle/oracle_service.py --action nav
```

### 14.4 前端本地開發

```bash
cd frontend
npm run dev
# 開啟 http://localhost:3000
```

### 14.5 Netlify 部署設定

```toml
# frontend/netlify.toml
[build]
  command   = "npm run build"
  publish   = "dist"
  functions = "netlify/functions"

[[redirects]]
  from   = "/*"
  to     = "/index.html"
  status = 200
```

Netlify 環境變數（在 Netlify Dashboard 設定）：
- `ALPACA_API_KEY`
- `ALPACA_SECRET_KEY`

---
