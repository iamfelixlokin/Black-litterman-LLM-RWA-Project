# Quick Start

## 環境需求

- Python 3.11+
- Node.js 18+
- MetaMask 瀏覽器擴充功能
- Alpaca Paper Trading 帳號
- Anthropic API Key

---

## 1. 安裝依賴

```bash
# Python
pip install -r requirements.txt

# Node（合約工具）
npm install
```

---

## 2. 設置環境變數

```bash
cp .env.example .env
```

編輯 `.env`，填入：

```
ANTHROPIC_API_KEY=你的key
ALCHEMY_RPC_URL=https://polygon-amoy.g.alchemy.com/v2/你的key
DEPLOYER_PRIVATE_KEY=你的錢包私鑰
ORACLE_PRIVATE_KEY=你的錢包私鑰
ALPACA_API_KEY=你的Alpaca key
ALPACA_SECRET_KEY=你的Alpaca secret
FUND_CONTRACT_ADDRESS=0xa6a0a939b194AbDCedAAD78ce8e4dd78641a8Ec5
USDC_CONTRACT_ADDRESS=0x5c08Ebb0129799cC75A67d71B2639989C3b50be8
```

---

## 3. 手動執行 Rebalance

```bash
# 執行完整 rebalance（BL 計算 → Alpaca 下單 → 更新鏈上）
python oracle/oracle_service.py --action rebalance

# 只更新 NAV
python oracle/oracle_service.py --action nav
```

---

## 4. 啟動前端（本地）

```bash
cd frontend
npm run dev
# 開啟 http://localhost:3000
```

---

## 5. 自動化（GitHub Actions）

每月1號 09:30 UTC 自動執行，無需開電腦。

需在 GitHub repo → Settings → Secrets 設定以下變數：

- `ANTHROPIC_API_KEY`
- `ALCHEMY_RPC_URL`
- `ORACLE_PRIVATE_KEY`
- `FUND_CONTRACT_ADDRESS`
- `USDC_CONTRACT_ADDRESS`
- `ALPACA_API_KEY`
- `ALPACA_SECRET_KEY`

手動觸發：GitHub → Actions → Monthly Rebalance → Run workflow

---

## 6. 使用前端申購/贖回

1. 連接 MetaMask（Polygon Amoy 網路）
2. 點「+ Get 100,000 test USDC」領測試幣
3. 在 Subscribe 輸入 USDC 金額 → 申購 M7F 代幣
4. 在 Redeem 輸入 M7F 金額 → 贖回 USDC

---

## 常見問題

**Q: 訂單送出後沒有成交？**
A: Alpaca 模擬倉只在美股交易時段成交（美東週一至週五 9:30–16:00）。

**Q: Redeem 失敗，gas 不足？**
A: 已內建 Polygon Amoy 最低 gas 設定（30 gwei tip），確認 MetaMask 網路正確。

**Q: LLM 返回 401？**
A: Anthropic API key 無效或額度用盡，更新 `.env` 中的 `ANTHROPIC_API_KEY`。
