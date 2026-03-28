# Project Structure

```
black_litterman_project/
│
├── README.md                          # 專案總覽
├── QUICKSTART.md                      # 快速開始指南
├── requirements.txt                   # Python依賴
├── .env.example                       # 環境變數範例
├── .gitignore                         # Git忽略文件
│
├── configs/                           # 配置文件
│   └── config.yaml                    # 主配置文件
│
├── src/                               # 源代碼
│   ├── main.py                        # 主執行腳本 ⭐
│   ├── utils.py                       # 工具函數
│   ├── data_collection.py             # 數據收集模組
│   ├── llm_view_generator.py          # LLM觀點生成器
│   ├── black_litterman.py             # Black-Litterman模型
│   ├── baseline_strategies.py         # Baseline策略
│   ├── backtest_engine.py             # 回測引擎（無前視偏差）
│   └── performance_metrics.py         # 績效分析與視覺化
│
├── data/                              # 數據目錄（gitignored）
│   ├── prices.csv                     # 價格數據（緩存）
│   └── news/                          # 新聞數據
│
├── results/                           # 結果輸出（gitignored）
│   ├── performance_summary.csv        # 績效摘要表
│   ├── cumulative_returns.png         # 累積收益圖
│   ├── drawdowns.png                  # 回撤分析
│   ├── rolling_metrics.png            # 滾動指標
│   ├── return_distributions.png       # 收益分佈
│   ├── weights_*.png                  # 權重演化
│   └── backtest_results.pkl           # 詳細結果
│
├── logs/                              # 日誌文件（gitignored）
│   └── backtest_YYYYMMDD_HHMMSS.log
│
├── notebooks/                         # Jupyter筆記本
│   ├── 01_data_exploration.ipynb      # 數據探索
│   ├── 02_strategy_analysis.ipynb     # 策略分析
│   └── 03_parameter_tuning.ipynb      # 參數調優
│
└── tests/                             # 測試文件
    └── test_installation.py           # 安裝測試腳本
```

## 模組說明

### 核心模組

#### 1. `main.py` - 主執行腳本
- 整合所有模組
- 控制完整工作流程
- 命令行介面

**使用方式：**
```bash
python main.py                    # 完整回測
python main.py --no-llm          # 不使用LLM
python main.py --force-update    # 強制更新數據
```

#### 2. `data_collection.py` - 數據收集
- 獲取股價數據（yfinance）
- 收集新聞標題
- 獲取財報數據
- 準備LLM上下文

**關鍵類：**
- `DataCollector`: 統一的數據收集介面

#### 3. `llm_view_generator.py` - LLM觀點生成
- 調用Anthropic API
- 分析非結構化數據
- 生成市場觀點
- 轉換為BL格式

**關鍵類：**
- `LLMViewGenerator`: LLM觀點生成器

**觀點格式：**
```python
{
    'ticker': 'AAPL',
    'expected_return': 0.02,      # 2%
    'confidence': 'high',         # high/medium/low
    'reasoning': 'Strong earnings...',
    'key_factors': ['earnings', 'AI']
}
```

#### 4. `black_litterman.py` - BL模型
- 計算市場隱含收益
- 貝葉斯整合觀點
- 投資組合優化

**關鍵類：**
- `BlackLittermanModel`: 完整BL實現

**核心方法：**
- `calculate_market_implied_returns()`: 反向優化
- `calculate_posterior_returns()`: 貝葉斯更新
- `optimize_portfolio()`: MVO優化

#### 5. `baseline_strategies.py` - Baseline策略
- Markowitz均值-方差
- 等權重組合
- 最小方差
- 風險平價

**關鍵類：**
- `BaselineStrategies`: Baseline策略集合

#### 6. `backtest_engine.py` - 回測引擎
- **嚴格無前視偏差**
- 滾動窗口估計
- 交易成本模擬
- 組合再平衡

**關鍵類：**
- `BacktestEngine`: 回測框架

**關鍵機制：**
```python
# 確保無前視偏差
hist_returns = ensure_no_lookahead(
    self.returns,
    current_date,  # 當前日期
    lookback_period  # 只使用歷史數據
)
```

#### 7. `performance_metrics.py` - 績效分析
- 計算風險調整收益指標
- 生成視覺化圖表
- 對比分析報告

**關鍵類：**
- `PerformanceAnalyzer`: 績效分析器

**指標：**
- Sharpe, Sortino, Calmar Ratios
- Maximum Drawdown
- Alpha, Beta, Information Ratio

### 工具模組

#### `utils.py` - 工具函數
- 收益計算
- 績效指標
- 再平衡日期生成
- 數據驗證

## 數據流程

```
1. Data Collection
   ↓
   [Price Data] + [News] + [Fundamentals] + [Macro]
   ↓
2. LLM View Generation
   ↓
   [Market Views: Expected Returns + Confidence]
   ↓
3. Black-Litterman
   ↓
   [Posterior Returns] → [Optimal Weights]
   ↓
4. Backtest Engine
   ↓
   [Portfolio Returns] + [Weights History]
   ↓
5. Performance Analysis
   ↓
   [Metrics] + [Visualizations] + [Report]
```

## 關鍵設計原則

### 1. 無前視偏差（No Look-Ahead Bias）
```python
# ✓ 正確：只使用歷史數據
hist_data = data[data.index < current_date]

# ✗ 錯誤：包含當前數據
hist_data = data[data.index <= current_date]
```

### 2. 時間序列完整性
- 所有估計使用滾動窗口
- 嚴格按時間順序處理
- 再平衡日期預先定義

### 3. 交易現實性
- 包含交易成本（0.1%）
- 包含滑點（0.05%）
- 考慮換手率

### 4. 模組化設計
- 每個策略獨立實現
- 統一的介面設計
- 易於擴展和測試

## 配置系統

### config.yaml 結構
```yaml
assets:              # 資產配置
backtest:            # 回測參數
black_litterman:     # BL模型參數
llm:                 # LLM配置
risk_management:     # 風險管理
baseline:            # Baseline策略
metrics:             # 績效指標
output:              # 輸出設置
```

## 擴展指南

### 添加新策略
1. 在 `baseline_strategies.py` 中實現策略
2. 在 `backtest_engine.py` 中添加回測方法
3. 更新 `run_all_strategies()` 方法

### 添加新數據源
1. 在 `data_collection.py` 中添加獲取方法
2. 更新 `prepare_llm_context()` 方法
3. 在 `config.yaml` 中配置數據源

### 自定義LLM Prompt
編輯 `llm_view_generator.py` 中的 `create_system_prompt()` 方法

### 調整風險參數
修改 `config.yaml` 中的：
- `risk_aversion`: 風險厭惡係數
- `tau`: 先驗不確定性
- `min_weight`, `max_weight`: 倉位限制

## 測試與驗證

### 運行測試
```bash
cd tests
python test_installation.py
```

### 驗證無前視偏差
```python
# 檢查回測代碼
# 確保所有數據過濾使用 '<' 而非 '<='
assert (data.index < current_date).all()
```

## 性能優化

### 加速技巧
1. 使用 `--no-llm` 跳過LLM調用
2. 減少再平衡頻率（月度 vs 周度）
3. 縮短回測期間
4. 使用多進程並行化

### 記憶體管理
- 數據按需載入
- 定期清理中間結果
- 使用生成器處理大數據集
