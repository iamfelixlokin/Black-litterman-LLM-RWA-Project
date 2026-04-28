# MAG7 Fund — Black-Litterman + LLM RWA Project

基於 Black-Litterman 模型與 Claude LLM 的量化策略，結合鏈上 RWA 代幣化的完整系統。每月自動對 Magnificent 7 科技股進行 rebalance，NAV 即時更新至 Polygon 區塊鏈，用戶可透過前端申購/贖回 M7F 代幣。

**前端網站**：https://black-litterman-llm-rwa.netlify.app

---

## 回測績效（真實結果）

| 策略 | 總報酬 | 年化報酬 | 年化波動率 | Sharpe | Max Drawdown |
|------|--------|----------|------------|--------|--------------|
| **Black-Litterman** | **+6,052%** | **53.28%** | 32.02% | **1.539** | -46.41% |
| Markowitz | +3,518% | 44.69% | 31.27% | 1.302 | -47.24% |
| Equal Weight | +2,416% | 38.91% | 28.90% | 1.208 | -49.38% |
| SPY Benchmark | +303% | 15.01% | 18.01% | 0.612 | -33.72% |

> 回測期間：2015-01-01 至 2025-12-31（約 10 年）｜BL 策略 Sharpe 1.539，年化 Alpha 87.20%，總報酬為 SPY 的 20 倍

---

## 系統架構

```
Claude LLM（生成市場觀點）
        ↓
Black-Litterman 模型（計算最優權重）
        ↓
Alpaca Paper Trading（模擬倉執行交易）
        ↓
Oracle（推送 NAV + 權重到鏈上）
        ↓
Polygon Amoy 智能合約（記錄 NAV、發行/贖回 M7F 代幣）
        ↓
前端 Dashboard（用戶申購、贖回、查看績效）
```

---

## 目標資產（Magnificent 7）

| 代號 | 公司 |
|------|------|
| AAPL | Apple |
| MSFT | Microsoft |
| GOOGL | Google |
| AMZN | Amazon |
| NVDA | Nvidia |
| TSLA | Tesla |
| META | Meta |

---

## 技術棧

| 層級 | 技術 |
|------|------|
| 策略 | Python, Black-Litterman, Anthropic Claude |
| 模擬交易 | Alpaca Paper Trading API |
| 區塊鏈 | Polygon Amoy testnet, Solidity 0.8.24 |
| 合約工具 | Hardhat, ethers.js v6, OpenZeppelin |
| 前端 | React + Vite, MetaMask |
| 自動化 | GitHub Actions（每月1號） |

---

## 專案結構

```
black_litterman_project/
│
├── README.md                          # 專案總覽（本文件）
├── QUICKSTART.md                      # 快速開始指南
├── TECHNICAL_DOCUMENTATION.md        # 完整技術文件
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

## 合約資訊（Polygon Amoy）

| 項目 | 地址 |
|------|------|
| M7F 基金代幣 | `0xa6a0a939b194AbDCedAAD78ce8e4dd78641a8Ec5` |
| 測試 USDC | `0x5c08Ebb0129799cC75A67d71B2639989C3b50be8` |

- 代幣名稱：MAG7 Fund（M7F）
- 小數位：18（M7F）、6（USDC）
- 初始 NAV：$100 USDC/token
- 申購/贖回手續費：0.5%

> ⚠️ 每位使用者需自行部署合約並使用自己的 ORACLE_ROLE 錢包，詳見 [QUICKSTART.md](./QUICKSTART.md)

---

## 完成度

| 組件 | 狀態 |
|------|------|
| BL 模型 | ✅ |
| Claude LLM 觀點生成 | ✅ |
| 回測引擎（無前視偏差） | ✅ |
| Alpaca 模擬倉整合 | ✅ |
| 智能合約（Polygon Amoy） | ✅ |
| Oracle 服務 | ✅ |
| 前端（Netlify） | ✅ |
| GitHub Actions 自動化 | ✅ |
| NAV 歷史圖表（localStorage + Alpaca history） | ✅ |
| Oracle 與回測 LLM 上下文一致性 | ✅ |

---

## 快速開始

詳見 [QUICKSTART.md](./QUICKSTART.md)

完整技術文件詳見 [TECHNICAL_DOCUMENTATION.md](./TECHNICAL_DOCUMENTATION.md)

---

## 免責聲明

本專案使用 Alpaca **Paper Trading**（模擬資金），不涉及真實資金。僅供研究與學習用途，不構成投資建議。
