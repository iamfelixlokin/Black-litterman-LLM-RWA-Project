# Project Structure

```
black_litterman_project/
│
├── README.md                          # 專案總覽
├── QUICKSTART.md                      # 快速開始指南
├── PROJECT_STRUCTURE.md               # 本文件
├── requirements.txt                   # Python 依賴
├── package.json                       # Node 依賴（Hardhat）
├── hardhat.config.js                  # Hardhat 設定（Polygon Amoy）
├── .env.example                       # 環境變數範例
├── .gitignore
│
├── src/                               # 策略核心
│   ├── black_litterman.py             # Black-Litterman 模型
│   ├── llm_view_generator.py          # Claude LLM 觀點生成
│   ├── data_collection.py             # yfinance 數據收集
│   ├── backtest_engine.py             # 回測引擎
│   ├── performance_metrics.py         # 績效分析
│   └── utils.py                       # 工具函數
│
├── oracle/                            # Oracle 服務
│   ├── oracle_service.py              # 主服務（rebalance + NAV）
│   ├── alpaca_trader.py               # Alpaca Paper Trading 整合
│   ├── nav_calculator.py              # NAV 計算邏輯
│   └── scheduler.py                   # 本地排程（備用）
│
├── contracts/                         # Solidity 智能合約
│   ├── RWAFund.sol                    # 主合約（M7F 代幣、NAV、申購贖回）
│   └── mocks/
│       └── MockUSDC.sol               # 測試網 USDC（含 faucet）
│
├── scripts/                           # Hardhat 腳本
│   ├── deploy.js                      # 部署合約到 Polygon Amoy
│   └── interact.js                    # 互動測試腳本
│
├── test/                              # 合約測試
│   └── RWAFund.test.js                # 25 個 Hardhat 測試
│
├── frontend/                          # 前端（React + Vite）
│   ├── netlify.toml                   # Netlify 部署設定
│   ├── package.json
│   └── src/
│       ├── App.jsx
│       ├── constants/
│       │   └── contracts.js           # 合約地址 + ABI
│       ├── hooks/
│       │   ├── useWallet.js           # MetaMask 連接
│       │   └── useFund.js             # 合約讀寫（含 gas 設定）
│       └── components/
│           ├── Header.jsx             # 錢包連接按鈕
│           ├── StatCard.jsx           # NAV / AUM / 發行量
│           ├── NAVChart.jsx           # NAV 歷史折線圖
│           ├── WeightsChart.jsx       # 持倉權重長條圖
│           ├── UserPosition.jsx       # 用戶餘額 + 領水龍頭
│           ├── SubscribeForm.jsx      # 申購表單
│           └── RedeemForm.jsx         # 贖回表單
│
├── .github/
│   └── workflows/
│       └── monthly_rebalance.yml      # 每月1號自動 rebalance
│
├── configs/
│   └── config.yaml                    # 策略參數設定
│
├── data/                              # 數據緩存（gitignored）
├── results/                           # 回測結果（gitignored）
└── logs/                              # 執行日誌（gitignored）
```

---

## 模組說明

### 策略層（`src/`）

| 檔案 | 功能 |
|------|------|
| `black_litterman.py` | BL 模型：計算市場隱含收益、貝葉斯整合觀點、最優化權重 |
| `llm_view_generator.py` | 呼叫 Claude API，為每支股票生成預期報酬與信心度 |
| `data_collection.py` | 用 yfinance 抓取過去 9 個月收盤價 |
| `backtest_engine.py` | 嚴格無前視偏差的回測框架 |
| `performance_metrics.py` | Sharpe、Sortino、Max Drawdown 等績效指標 |

### Oracle 層（`oracle/`）

| 檔案 | 功能 |
|------|------|
| `oracle_service.py` | 串接策略 → Alpaca → 鏈上的完整流程 |
| `alpaca_trader.py` | 計算各股買賣數量、向 Alpaca 送出市價單 |
| `nav_calculator.py` | 從 Alpaca portfolio equity 換算 NAV |

### 合約層（`contracts/`）

**RWAFund.sol**
- M7F 代幣（soulbound，不可轉讓）
- 記錄 NAV、持倉權重、申購/贖回
- 角色：ORACLE_ROLE（更新 NAV）、MANAGER_ROLE

**MockUSDC.sol**
- 測試網 USDC，含 `faucet()` 可領 100,000 USDC

### 自動化（`.github/workflows/`）

每月1號 09:30 UTC，GitHub Actions 伺服器自動：
1. 跑 BL 模型計算新權重
2. Alpaca 執行調倉
3. 把 NAV + 權重推到 Polygon Amoy

---

## 資料流程

```
yfinance（價格數據）+ Claude LLM（市場觀點）
                    ↓
           Black-Litterman 模型
                    ↓
              最優持倉權重
                    ↓
        Alpaca Paper Trading（模擬執行）
                    ↓
         Oracle（計算真實 NAV）
                    ↓
       Polygon Amoy 智能合約（鏈上記錄）
                    ↓
          前端 Dashboard（用戶操作）
```
