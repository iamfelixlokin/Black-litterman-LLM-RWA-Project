# Black-Litterman Portfolio Optimization with LLM-Generated Views

## 專案概述
本專案實現了基於Black-Litterman模型的資產配置系統，使用LLM分析非結構化數據生成市場觀點，針對美國七大科技股（Magnificent 7）進行投資組合優化。

## 目標資產
- AAPL (Apple)
- MSFT (Microsoft)
- GOOGL (Google)
- AMZN (Amazon)
- NVDA (Nvidia)
- TSLA (Tesla)
- META (Meta)

## 策略架構

### 1. Black-Litterman Model
- **市場均衡**：使用歷史數據估計市場隱含收益
- **主觀觀點**：通過LLM分析新聞、財報、宏觀經濟數據生成
- **觀點整合**：貝葉斯框架結合市場均衡與主觀觀點
- **組合優化**：最大化效用函數得到最優權重

### 2. Baseline 策略
- **Markowitz Mean-Variance**: 傳統均值-方差優化
- **SPY Benchmark**: 追蹤S&P 500指數
- **Equal Weight**: 等權重配置七大股

### 3. 回測框架
- **無前視偏差**：嚴格的時間序列分割
- **滾動窗口**：定期重新平衡
- **交易成本**：考慮滑點與手續費
- **風險管理**：槓桿限制與止損機制

## 專案結構
```
black_litterman_project/
├── src/
│   ├── data_collection.py      # 數據收集（價格、新聞、財報）
│   ├── llm_view_generator.py   # LLM觀點生成器
│   ├── black_litterman.py      # BL模型實現
│   ├── baseline_strategies.py  # Baseline策略
│   ├── backtest_engine.py      # 回測引擎
│   ├── performance_metrics.py  # 績效評估
│   └── utils.py                # 工具函數
├── configs/
│   └── config.yaml             # 配置文件
├── data/                       # 數據存儲
├── results/                    # 回測結果
├── notebooks/                  # 分析筆記本
└── requirements.txt            # 依賴套件
```

## 安裝依賴
```bash
pip install -r requirements.txt
```

## 使用方法

### 1. 數據收集
```python
python src/data_collection.py --start_date 2020-01-01 --end_date 2024-12-31
```

### 2. 運行回測
```python
python src/backtest_engine.py --config configs/config.yaml
```

### 3. 生成報告
```python
python src/performance_metrics.py --results_dir results/
```

## 關鍵特性
- ✅ 無前視偏差的回測設計
- ✅ LLM驅動的觀點生成
- ✅ 多基準策略對比
- ✅ 完整的風險管理
- ✅ 詳細的績效分析

## 注意事項
1. 需要API密鑰：Anthropic API (LLM)、Alpha Vantage/yfinance (數據)
2. 建議使用GPU加速LLM推理
3. 數據收集可能需要較長時間
4. 回測結果僅供研究參考，不構成投資建議

## 作者
Quant Research Team

## 授權
MIT License
