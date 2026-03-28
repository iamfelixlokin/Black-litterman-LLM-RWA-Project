# MAG7 Fund — Black-Litterman + LLM RWA Project

基於 Black-Litterman 模型與 Claude LLM 的量化策略，結合鏈上 RWA 代幣化的完整系統。每月自動對 Magnificent 7 科技股進行 rebalance，NAV 即時更新至 Polygon 區塊鏈，用戶可透過前端申購/贖回 M7F 代幣。

**前端網站**：https://black-litterman-llm-rwa.netlify.app

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
├── src/                        # 策略核心
│   ├── black_litterman.py      # BL 模型
│   ├── llm_view_generator.py   # Claude LLM 觀點生成
│   ├── data_collection.py      # yfinance 數據收集
│   ├── backtest_engine.py      # 回測引擎
│   └── performance_metrics.py  # 績效分析
├── oracle/                     # Oracle 服務
│   ├── oracle_service.py       # 主服務（NAV + rebalance）
│   ├── alpaca_trader.py        # Alpaca 模擬倉整合
│   ├── nav_calculator.py       # NAV 計算
│   └── scheduler.py            # 本地排程（可選）
├── contracts/                  # 智能合約
│   ├── RWAFund.sol             # 主合約（M7F 代幣）
│   └── mocks/MockUSDC.sol      # 測試 USDC
├── frontend/                   # 前端
│   └── src/                    # React 組件
├── scripts/                    # Hardhat 腳本
│   ├── deploy.js               # 部署合約
│   └── interact.js             # 互動測試
├── .github/workflows/          # GitHub Actions
│   └── monthly_rebalance.yml   # 每月自動 rebalance
├── .env.example                # 環境變數範例
└── requirements.txt            # Python 依賴
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

---

## 快速開始

詳見 [QUICKSTART.md](./QUICKSTART.md)

---

## 免責聲明

本專案使用 Alpaca **Paper Trading**（模擬資金），不涉及真實資金。僅供研究與學習用途，不構成投資建議。
