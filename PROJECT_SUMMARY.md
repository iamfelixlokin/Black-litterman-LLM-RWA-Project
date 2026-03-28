# MAG7 Fund — 專案摘要

## 專案概述

使用 Black-Litterman 模型結合 Claude LLM 生成的市場觀點，對 Magnificent 7 科技股進行最優資產配置，並透過鏈上 RWA 代幣化實現申購/贖回機制。

**核心特點：**
- LLM 驅動觀點：Claude 為每支股票生成預期報酬與信心度
- Black-Litterman 貝葉斯整合：結合市場均衡與 LLM 觀點
- 全自動化：GitHub Actions 每月1號自動 rebalance
- 鏈上透明：NAV + 持倉權重即時記錄於 Polygon Amoy
- 模擬交易：Alpaca Paper Trading 執行真實模擬倉位

---

## 回測績效（真實結果）

| 策略 | 總報酬 | 年化報酬 | 年化波動率 | Sharpe | Max Drawdown |
|------|--------|----------|------------|--------|--------------|
| **Black-Litterman** | **58.20%** | **52.70%** | 32.08% | **1.52** | -48.75% |
| Markowitz | 35.18% | 44.69% | 31.27% | 1.30 | -47.24% |
| Equal Weight | 24.16% | 38.91% | 28.90% | 1.21 | -49.38% |
| SPY Benchmark | 3.03% | 15.01% | 18.01% | 0.61 | -33.72% |

**BL 策略表現最優**，Sharpe 1.52，Alpha 0.49，總報酬領先 Markowitz 約 23%。

---

## 系統架構

```
Claude LLM（市場觀點）+ 歷史價格數據
              ↓
     Black-Litterman 模型（最優權重）
              ↓
    Alpaca Paper Trading（模擬執行）
              ↓
       Oracle（計算 NAV）
              ↓
  Polygon Amoy 智能合約（鏈上記錄）
              ↓
   Netlify 前端（申購 / 贖回 M7F）
```

---

## 合約資訊

| 項目 | 值 |
|------|-----|
| 網路 | Polygon Amoy testnet |
| M7F 代幣 | `0xa6a0a939b194AbDCedAAD78ce8e4dd78641a8Ec5` |
| 測試 USDC | `0x5c08Ebb0129799cC75A67d71B2639989C3b50be8` |
| 初始 NAV | $100 USDC |
| 手續費 | 申購/贖回各 0.5% |

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

---

## 免責聲明

本專案使用 Alpaca Paper Trading（模擬資金），不涉及真實資金。僅供研究與學習用途，不構成投資建議。
