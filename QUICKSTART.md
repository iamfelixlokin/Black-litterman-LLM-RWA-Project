# Quick Start Guide

## 🚀 快速開始

### 1. 環境設置

```bash
# 克隆或下載專案
cd black_litterman_project

# 創建虛擬環境（推薦）
python -m venv venv
source venv/bin/activate  # Linux/Mac
# 或
venv\Scripts\activate  # Windows

# 安裝依賴
pip install -r requirements.txt
```

### 2. API 設置

```bash
# 複製環境變數範例
cp .env.example .env

# 編輯 .env 文件，添加你的 Anthropic API key
# ANTHROPIC_API_KEY=sk-ant-xxxxx...
```

### 3. 運行完整回測

```bash
cd src

# 運行完整回測（包含 LLM 觀點生成）
python main.py

# 或不使用 LLM（更快，用於測試）
python main.py --no-llm

# 使用自定義配置
python main.py --config ../configs/custom_config.yaml

# 強制更新數據
python main.py --force-update
```

### 4. 查看結果

回測完成後，結果保存在 `results/` 目錄：

- `performance_summary.csv` - 策略績效對比表
- `cumulative_returns.png` - 累積收益圖
- `drawdowns.png` - 回撤分析
- `rolling_metrics.png` - 滾動指標
- `return_distributions.png` - 收益分佈
- `weights_*.png` - 各策略權重演化
- `backtest_results.pkl` - 詳細結果數據

### 5. 自定義配置

編輯 `configs/config.yaml` 來調整：

- **資產池**：修改 `assets.tickers`
- **回測參數**：調整 `backtest` 部分
- **Black-Litterman參數**：修改 `black_litterman` 設置
- **LLM配置**：調整 `llm` 部分
- **風險管理**：設置 `risk_management` 限制

### 6. 分析個別模組

```bash
# 測試數據收集
python data_collection.py

# 測試 LLM 觀點生成
export ANTHROPIC_API_KEY=your_key
python llm_view_generator.py

# 測試 Black-Litterman 模型
python black_litterman.py

# 測試 Baseline 策略
python baseline_strategies.py

# 測試績效分析
python performance_metrics.py
```

## 📊 預期輸出

### 控制台輸出範例

```
================================================================================
BLACK-LITTERMAN PORTFOLIO OPTIMIZATION
================================================================================
Start time: 2024-01-15 10:30:00

================================================================================
STEP 1: DATA COLLECTION
================================================================================
Fetching price data from 2021-01-01 to 2024-12-31
Price data shape: (1008, 8)

================================================================================
STEP 2: LLM SETUP
================================================================================
Initializing LLM view generator...

================================================================================
STEP 3: BACKTEST EXECUTION
================================================================================
Running Black-Litterman Strategy...
Running Markowitz Strategy...
Running Equal Weight Strategy...
Running SPY Benchmark...

================================================================================
STEP 4: PERFORMANCE ANALYSIS
================================================================================
PERFORMANCE SUMMARY
Strategy          Total Return  Ann. Return  Ann. Vol  Sharpe  Max DD
Black-Litterman        24.5%       12.3%     18.5%    0.62   -15.2%
Markowitz              19.8%       10.1%     16.2%    0.54   -12.8%
Equal Weight           22.1%       11.2%     19.8%    0.51   -16.5%
SPY Benchmark          18.5%        9.4%     17.1%    0.48   -18.2%

Results saved to: results/
================================================================================
```

## 🔧 常見問題

### Q: 回測運行很慢？
A: 使用 `--no-llm` 標誌跳過 LLM 調用，或減少 `config.yaml` 中的 `rebalance_frequency`

### Q: 沒有 API key 可以運行嗎？
A: 可以！使用 `--no-llm` 運行，將使用市場均衡而非 LLM 觀點

### Q: 如何添加其他股票？
A: 編輯 `configs/config.yaml` 中的 `assets.tickers` 列表

### Q: 如何調整風險偏好？
A: 修改 `black_litterman.risk_aversion`（較高 = 更保守）

### Q: 數據從哪裡來？
A: 使用 yfinance 從 Yahoo Finance 獲取免費數據

## 📈 下一步

1. **優化參數**：嘗試不同的 `tau`, `risk_aversion` 值
2. **添加約束**：在 `risk_management` 中設置更嚴格的限制
3. **自定義觀點**：修改 LLM system prompt
4. **擴展資產**：添加更多股票或資產類別
5. **實時交易**：整合券商 API 進行實盤交易（謹慎！）

## 📚 相關資源

- [Black-Litterman Model 論文](http://www.blacklitterman.org/)
- [Anthropic API 文檔](https://docs.anthropic.com/)
- [Portfolio Optimization 理論](https://en.wikipedia.org/wiki/Modern_portfolio_theory)

## ⚠️ 免責聲明

本專案僅供研究和教育用途。歷史績效不代表未來結果。投資有風險，請謹慎決策。
