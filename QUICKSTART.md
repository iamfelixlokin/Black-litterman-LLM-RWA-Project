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

# 前端
cd frontend && npm install && cd ..
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
DEPLOYER_PRIVATE_KEY=你的錢包私鑰（0x 開頭）
ORACLE_PRIVATE_KEY=你的錢包私鑰（0x 開頭）
ORACLE_ADDRESS=你的錢包地址（0x 開頭）
ALPACA_API_KEY=你的Alpaca key
ALPACA_SECRET_KEY=你的Alpaca secret

# 已部署的合約地址（Polygon Amoy），直接複製貼上即可
FUND_CONTRACT_ADDRESS=0xa6a0a939b194AbDCedAAD78ce8e4dd78641a8Ec5
USDC_CONTRACT_ADDRESS=0x5c08Ebb0129799cC75A67d71B2639989C3b50be8

# 前端用（Vite 必須加 VITE_ 前綴）
VITE_FUND_ADDRESS=0xa6a0a939b194AbDCedAAD78ce8e4dd78641a8Ec5
VITE_USDC_ADDRESS=0x5c08Ebb0129799cC75A67d71B2639989C3b50be8
```

> ⚠️ **私鑰說明**：DEPLOYER_PRIVATE_KEY / ORACLE_PRIVATE_KEY 填的是私鑰（64位 hex 字串），**不是錢包地址**。請勿混淆。

> 💧 **取 Amoy MATIC**：Oracle 錢包需持有少量 MATIC 支付 gas，前往 [Polygon Faucet](https://faucet.polygon.technology/) 輸入錢包地址免費領取。

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

> 本地前端直接讀取 `.env` 中的 `VITE_FUND_ADDRESS` / `VITE_USDC_ADDRESS`，確認已填寫。
> NAV 即時數據由 Netlify Function 代理 Alpaca API 提供；本地開發時 NAV 可能顯示為靜態合約值，部署 Netlify 後才會即時更新。

---

## 4b. 部署前端到 Netlify（選用）

讓前端永久上線且 NAV 即時更新：

1. Push 專案到 GitHub
2. 前往 [netlify.com](https://netlify.com) → **Add new site → Import from GitHub**
3. 設定：
   - **Base directory**: `frontend`
   - **Build command**: `npm run build`
   - **Publish directory**: `frontend/dist`
4. 在 Netlify → **Site settings → Environment variables** 加入：
   ```
   VITE_FUND_ADDRESS=0xa6a0a939b194AbDCedAAD78ce8e4dd78641a8Ec5
   VITE_USDC_ADDRESS=0x5c08Ebb0129799cC75A67d71B2639989C3b50be8
   ALPACA_API_KEY=你的Alpaca key
   ALPACA_SECRET_KEY=你的Alpaca secret
   ```
5. Deploy → 取得 `https://你的站名.netlify.app`

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

**Q: 前端 NAV 顯示為 $100 或沒有更新？**
A: 本地開發時 NAV 固定顯示合約初始值。部署到 Netlify 並設定 `ALPACA_API_KEY` / `ALPACA_SECRET_KEY` 環境變數後，即可即時從 Alpaca 帳戶讀取最新持倉淨值。

**Q: oracle_service.py 執行出現 `private key must be 32 bytes`？**
A: ORACLE_PRIVATE_KEY 填的是私鑰（64位 hex），**不是錢包地址**。請從 MetaMask → Account Details → Export Private Key 取得正確值。

**Q: MetaMask 如何切換到 Polygon Amoy？**
A: 前往 [chainlist.org](https://chainlist.org/?search=amoy)，搜尋 "Amoy"，點 "Add to MetaMask"。或手動新增：RPC `https://rpc-amoy.polygon.technology`，Chain ID `80002`，符號 `MATIC`。
