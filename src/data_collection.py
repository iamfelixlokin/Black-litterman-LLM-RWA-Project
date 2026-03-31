"""
Data collection module for Black-Litterman portfolio optimization
Collects price data, news, earnings reports, and macro indicators
"""

import os
import yfinance as yf
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from typing import List, Dict, Optional
import logging
import requests
from bs4 import BeautifulSoup
import feedparser
import time

logger = logging.getLogger(__name__)


class DataCollector:
    """
    Collects financial data for portfolio optimization
    """
    
    def __init__(self, tickers: List[str], benchmark: str = "SPY"):
        """
        Initialize data collector
        
        Parameters:
        -----------
        tickers : List[str]
            List of stock tickers
        benchmark : str
            Benchmark ticker
        """
        self.tickers = tickers
        self.benchmark = benchmark
        self.all_tickers = tickers + [benchmark]
        
    def fetch_price_data(self, 
                        start_date: str, 
                        end_date: str,
                        interval: str = "1d") -> pd.DataFrame:
        """
        Fetch historical price data
        
        Parameters:
        -----------
        start_date : str
            Start date (YYYY-MM-DD)
        end_date : str
            End date (YYYY-MM-DD)
        interval : str
            Data interval (1d, 1wk, 1mo)
        
        Returns:
        --------
        pd.DataFrame : Price data (adjusted close)
        """
        logger.info(f"Fetching price data from {start_date} to {end_date}")

        # Use a per-process temp cache dir to avoid SQLite lock conflicts in CI
        import tempfile
        cache_dir = os.path.join(tempfile.gettempdir(), f"yf_cache_{os.getpid()}")
        os.makedirs(cache_dir, exist_ok=True)
        os.environ["YFINANCE_CACHE_DIR"] = cache_dir

        try:
            # 批量下載所有股票（更快更穩定）
            data = yf.download(
                self.all_tickers,
                start=start_date,
                end=end_date,
                interval=interval,
                progress=False,
                group_by='ticker'
            )
            
            # 提取 Adj Close 價格
            prices = pd.DataFrame()
            
            for ticker in self.all_tickers:
                try:
                    # 處理多層索引的情況
                    if len(self.all_tickers) > 1:
                        if ticker in data.columns.get_level_values(0):
                            ticker_data = data[ticker]
                            if 'Adj Close' in ticker_data.columns:
                                prices[ticker] = ticker_data['Adj Close']
                            elif 'Close' in ticker_data.columns:
                                prices[ticker] = ticker_data['Close']
                    else:
                        # 單一股票的情況
                        if 'Adj Close' in data.columns:
                            prices[ticker] = data['Adj Close']
                        elif 'Close' in data.columns:
                            prices[ticker] = data['Close']
                    
                    logger.info(f"Successfully fetched {ticker} data")
                    
                except Exception as e:
                    logger.warning(f"Error processing {ticker} from batch: {e}, trying individual download")
                    
                    # Fallback: 單獨下載
                    try:
                        single_data = yf.download(
                            ticker,
                            start=start_date,
                            end=end_date,
                            interval=interval,
                            progress=False
                        )
                        
                        if not single_data.empty:
                            if 'Adj Close' in single_data.columns:
                                prices[ticker] = single_data['Adj Close']
                            elif 'Close' in single_data.columns:
                                prices[ticker] = single_data['Close']
                            logger.info(f"Successfully fetched {ticker} data (individual)")
                    except Exception as e2:
                        logger.error(f"Failed to fetch {ticker}: {e2}")
            
            # 清理數據
            prices = prices.dropna()
            
            if prices.empty:
                logger.error("No price data was successfully fetched!")
            else:
                logger.info(f"Price data shape: {prices.shape}")
                logger.info(f"Tickers fetched: {list(prices.columns)}")
            
            return prices
            
        except Exception as e:
            logger.error(f"Error in batch download: {e}")
            
            # 完全失敗時嘗試逐個下載
            logger.info("Attempting individual downloads as fallback...")
            prices = pd.DataFrame()
            
            for ticker in self.all_tickers:
                try:
                    data = yf.download(
                        ticker,
                        start=start_date,
                        end=end_date,
                        interval=interval,
                        progress=False
                    )
                    
                    if not data.empty:
                        if 'Adj Close' in data.columns:
                            prices[ticker] = data['Adj Close']
                        elif 'Close' in data.columns:
                            prices[ticker] = data['Close']
                        logger.info(f"Successfully fetched {ticker} data")
                    
                    time.sleep(0.3)  # Rate limiting
                    
                except Exception as e:
                    logger.error(f"Error fetching {ticker}: {e}")
            
            prices = prices.dropna()
            logger.info(f"Fallback fetch complete. Price data shape: {prices.shape}")
            
            return prices
    
    def load_historical_news(self, ticker: str, news_dir: str = "../data/news") -> pd.DataFrame:
        """
        Load pre-downloaded historical news from local storage
        
        Parameters:
        -----------
        ticker : str
            Stock ticker
        news_dir : str
            Directory containing news CSV files
        
        Returns:
        --------
        pd.DataFrame : Historical news articles
        """
        news_file = os.path.join(news_dir, f"{ticker}_news.csv")
        
        if os.path.exists(news_file):
            df = pd.read_csv(news_file)
            df['date'] = pd.to_datetime(df['date'])
            logger.info(f"Loaded {len(df)} historical news articles for {ticker}")
            return df
        else:
            logger.warning(f"No historical news file found for {ticker}: {news_file}")
            return pd.DataFrame()
    
    def get_news_for_date(self,
                          ticker: str,
                          date: pd.Timestamp,
                          lookback_days: int = 7,
                          news_dir: str = "../data/news") -> List[Dict]:
        """
        Get news articles for a specific date from historical data
        
        CRITICAL: Only returns news published BEFORE the given date (no look-ahead bias)
        
        Parameters:
        -----------
        ticker : str
            Stock ticker
        date : pd.Timestamp
            Target date (only news before this date)
        lookback_days : int
            Number of days to look back
        news_dir : str
            Directory containing news CSV files
        
        Returns:
        --------
        List[Dict] : News articles
        """
        df = self.load_historical_news(ticker, news_dir)
        
        if df.empty:
            return []
        
        # Filter: news published between (date - lookback_days) and date
        start_date = date - timedelta(days=lookback_days)
        mask = (df['date'] > start_date) & (df['date'] <= date)
        filtered_df = df[mask].sort_values('date', ascending=False)
        
        # Convert to list of dicts
        news_items = []
        for _, row in filtered_df.head(10).iterrows():  # Top 10 most recent
            news_items.append({
                'title': row['title'],
                'date': row['date'],
                'domain': row.get('domain', ''),
                'tone': row.get('tone', 0),  # Sentiment score
                'url': row.get('url', '')
            })
        
        logger.info(f"Found {len(news_items)} news articles for {ticker} "
                   f"between {start_date.date()} and {date.date()}")
        
        return news_items

    
    def fetch_earnings_data(self, ticker: str) -> Dict:
        """
        Fetch earnings and fundamental data
        
        Parameters:
        -----------
        ticker : str
            Stock ticker
        
        Returns:
        --------
        Dict : Earnings and fundamental data
        """
        try:
            stock = yf.Ticker(ticker)
            
            # Get financial data
            info = stock.info
            financials = stock.financials
            earnings = stock.earnings
            
            data = {
                'ticker': ticker,
                'market_cap': info.get('marketCap'),
                'pe_ratio': info.get('trailingPE'),
                'forward_pe': info.get('forwardPE'),
                'peg_ratio': info.get('pegRatio'),
                'profit_margin': info.get('profitMargins'),
                'revenue_growth': info.get('revenueGrowth'),
                'earnings_growth': info.get('earningsGrowth'),
                'beta': info.get('beta'),
                'recommendation': info.get('recommendationKey'),
                'target_price': info.get('targetMeanPrice'),
            }
            
            logger.info(f"Fetched fundamental data for {ticker}")
            return data
            
        except Exception as e:
            logger.error(f"Error fetching earnings data for {ticker}: {e}")
            return {}
    
    def fetch_macro_indicators(self, date: pd.Timestamp) -> Dict:
        """
        Fetch macroeconomic indicators
        
        Parameters:
        -----------
        date : pd.Timestamp
            Target date
        
        Returns:
        --------
        Dict : Macro indicators (GDP, inflation, rates, etc.)
        """
        macro_data = {
            'date': date,
            'gdp_growth': None,
            'inflation_rate': None,
            'unemployment_rate': None,
            'interest_rate': None,
            'vix': None,
            'treasury_yield_10y': None,
        }
        
        try:
            # Fetch VIX
            vix = yf.download('^VIX', start=date - timedelta(days=5), 
                            end=date, progress=False)
            if not vix.empty:
                # Handle both single and multi-index columns
                if isinstance(vix.columns, pd.MultiIndex):
                    if 'Close' in vix.columns.get_level_values(0):
                        vix_val = vix['Close'].iloc[-1]
                        if isinstance(vix_val, pd.Series):
                            vix_val = vix_val.iloc[0]
                        macro_data['vix'] = float(vix_val) if not pd.isna(vix_val) else None
                elif 'Close' in vix.columns:
                    vix_val = vix['Close'].iloc[-1]
                    macro_data['vix'] = float(vix_val) if not pd.isna(vix_val) else None
            
            # Fetch 10-year treasury
            treasury = yf.download('^TNX', start=date - timedelta(days=5),
                                  end=date, progress=False)
            if not treasury.empty:
                # Handle both single and multi-index columns
                if isinstance(treasury.columns, pd.MultiIndex):
                    if 'Close' in treasury.columns.get_level_values(0):
                        treasury_val = treasury['Close'].iloc[-1]
                        if isinstance(treasury_val, pd.Series):
                            treasury_val = treasury_val.iloc[0]
                        macro_data['treasury_yield_10y'] = float(treasury_val) if not pd.isna(treasury_val) else None
                elif 'Close' in treasury.columns:
                    treasury_val = treasury['Close'].iloc[-1]
                    macro_data['treasury_yield_10y'] = float(treasury_val) if not pd.isna(treasury_val) else None
                
        except Exception as e:
            logger.error(f"Error fetching macro data: {e}")
        
        return macro_data
    
    def prepare_llm_context(self,
                       ticker: str,
                       date: pd.Timestamp,
                       price_history: pd.DataFrame,
                       lookback_days: int = 60,
                       use_news: bool = False) -> str:
        """
        Prepare context string for LLM analysis with RELATIVE performance (Alpha)
    
        CRITICAL: Only uses data available up to 'date' to avoid look-ahead bias
    
        Parameters:
        -----------
        ticker : str
            Stock ticker
        date : pd.Timestamp
            Current date (all data must be before this)
        price_history : pd.DataFrame
            Historical price data (must include 'SPY' column for market benchmark)
        lookback_days : int
            Days of history to include
        use_news : bool
            Whether to include historical news (requires pre-downloaded data)
        
        Returns:
        --------
        str : Formatted context for LLM with relative performance metrics
        """
        context_parts = []
    
        # 1. Price Performance (ONLY historical data up to 'date')
        start_date = date - timedelta(days=lookback_days)
        recent_prices = price_history[ticker][start_date:date]
        
        # Check if SPY data is available
        has_spy = 'SPY' in price_history.columns
        if has_spy:
            spy_prices = price_history['SPY'][start_date:date]
        
        if len(recent_prices) > 5:  # Need at least 5 days
            # Calculate returns over different periods
            current_price = float(recent_prices.iloc[-1])
            
            # 7-day returns (asset and market)
            if len(recent_prices) >= 7:
                price_7d_ago = float(recent_prices.iloc[-7])
                return_7d = (current_price / price_7d_ago - 1) * 100
                
                if has_spy:
                    spy_7d_ago = float(spy_prices.iloc[-7])
                    spy_return_7d = (float(spy_prices.iloc[-1]) / spy_7d_ago - 1) * 100
                    alpha_7d = return_7d - spy_return_7d
                else:
                    alpha_7d = None
            else:
                return_7d = 0.0
                alpha_7d = None
            
            # 30-day returns (asset and market)
            if len(recent_prices) >= 30:
                price_30d_ago = float(recent_prices.iloc[-30])
                return_30d = (current_price / price_30d_ago - 1) * 100
                
                if has_spy:
                    spy_30d_ago = float(spy_prices.iloc[-30])
                    spy_return_30d = (float(spy_prices.iloc[-1]) / spy_30d_ago - 1) * 100
                    alpha_30d = return_30d - spy_return_30d
                else:
                    alpha_30d = None
            else:
                return_30d = 0.0
                alpha_30d = None
            
            # 60-day returns (asset and market)
            price_start = float(recent_prices.iloc[0])
            return_full = (current_price / price_start - 1) * 100
            
            if has_spy:
                spy_start = float(spy_prices.iloc[0])
                spy_return_full = (float(spy_prices.iloc[-1]) / spy_start - 1) * 100
                alpha_full = return_full - spy_return_full
            else:
                alpha_full = None
            
            # Volatility
            returns = recent_prices.pct_change().dropna()
            if len(returns) > 1:
                volatility = float(returns.std() * np.sqrt(252) * 100)
            else:
                volatility = 0.0
            
            # Trend strength (regression slope)
            if len(recent_prices) >= 20:
                x = np.arange(len(recent_prices))
                y = np.log(recent_prices.values)
                slope = np.polyfit(x, y, 1)[0]
                trend_strength = slope * 252 * 100  # Annualized
            else:
                trend_strength = 0.0
            
            # Format context
            context_parts.append(f"=== {ticker} Relative Performance Analysis (as of {date.strftime('%Y-%m-%d')}) ===")
            context_parts.append(f"Current Price: ${current_price:.2f}")
            context_parts.append("")
            
            # Absolute returns
            context_parts.append("--- Absolute Returns ---")
            context_parts.append(f"7-Day Return: {return_7d:.2f}%")
            context_parts.append(f"30-Day Return: {return_30d:.2f}%")
            context_parts.append(f"{lookback_days}-Day Return: {return_full:.2f}%")
            context_parts.append(f"Annualized Volatility: {volatility:.2f}%")
            context_parts.append(f"Trend Strength (annualized): {trend_strength:.2f}%")
            context_parts.append("")
            
            # Relative performance (Alpha) - CRITICAL FOR LLM
            if has_spy and alpha_30d is not None:
                context_parts.append("--- RELATIVE Performance vs SPY (Alpha) ---")
                context_parts.append(f"7-Day Alpha: {alpha_7d:+.2f}% (Asset: {return_7d:.2f}% vs SPY: {spy_return_7d:.2f}%)")
                context_parts.append(f"30-Day Alpha: {alpha_30d:+.2f}% (Asset: {return_30d:.2f}% vs SPY: {spy_return_30d:.2f}%)")
                context_parts.append(f"{lookback_days}-Day Alpha: {alpha_full:+.2f}% (Asset: {return_full:.2f}% vs SPY: {spy_return_full:.2f}%)")
                context_parts.append("")
                
                # Relative strength classification
                if alpha_30d > 5:
                    rel_strength = "STRONG OUTPERFORMANCE"
                elif alpha_30d > 2:
                    rel_strength = "MODERATE OUTPERFORMANCE"
                elif alpha_30d > -2:
                    rel_strength = "IN LINE WITH MARKET"
                elif alpha_30d > -5:
                    rel_strength = "MODERATE UNDERPERFORMANCE"
                else:
                    rel_strength = "STRONG UNDERPERFORMANCE"
                
                context_parts.append(f"Relative Strength: {rel_strength}")
                
                # Alpha trend (is relative performance improving?)
                if alpha_7d is not None and alpha_30d is not None:
                    if alpha_7d > alpha_30d + 1:
                        alpha_trend = "ACCELERATING (recent alpha > longer-term alpha)"
                    elif alpha_7d < alpha_30d - 1:
                        alpha_trend = "DECELERATING (recent alpha < longer-term alpha)"
                    else:
                        alpha_trend = "STABLE (consistent relative performance)"
                    
                    context_parts.append(f"Alpha Trend: {alpha_trend}")
                context_parts.append("")
            else:
                context_parts.append("--- Note: SPY data not available, showing absolute returns only ---")
                context_parts.append("")
            
            # Absolute momentum classification (fallback if no SPY)
            if alpha_30d is None:
                if return_30d > 10:
                    momentum = "STRONG UPTREND"
                elif return_30d > 3:
                    momentum = "MODERATE UPTREND"
                elif return_30d > -3:
                    momentum = "SIDEWAYS"
                elif return_30d > -10:
                    momentum = "MODERATE DOWNTREND"
                else:
                    momentum = "STRONG DOWNTREND"
                
                context_parts.append(f"Momentum Classification: {momentum}")
                context_parts.append(f"Recent Acceleration: {'ACCELERATING' if return_7d > return_30d/4 else 'DECELERATING'}")
                context_parts.append("")
        
        # 2. Historical News (if available and enabled)
        if use_news:
            try:
                news = self.get_news_for_date(ticker, date, lookback_days=7)
                if news:
                    context_parts.append(f"=== Recent News (past 7 days) ===")
                    
                    # Calculate average sentiment
                    sentiments = [item['tone'] for item in news if 'tone' in item]
                    if sentiments:
                        avg_sentiment = sum(sentiments) / len(sentiments)
                        sentiment_label = "POSITIVE" if avg_sentiment > 1 else "NEGATIVE" if avg_sentiment < -1 else "NEUTRAL"
                        context_parts.append(f"Overall Sentiment: {sentiment_label} (score: {avg_sentiment:.2f})")
                    
                    # Top news headlines
                    context_parts.append(f"Recent headlines ({len(news)} articles):")
                    for i, item in enumerate(news[:5], 1):
                        context_parts.append(f"{i}. {item.get('title', 'N/A')} (tone: {item.get('tone', 0):.1f})")
                    context_parts.append("")
            except Exception as e:
                logger.debug(f"Error loading news for {ticker}: {e}")
        
        return "\n".join(context_parts)
    
    def save_data(self, data: pd.DataFrame, filename: str):
        """Save data to CSV"""
        data.to_csv(filename)
        logger.info(f"Data saved to {filename}")
    
    def load_data(self, filename: str) -> pd.DataFrame:
        """Load data from CSV"""
        data = pd.read_csv(filename, index_col=0, parse_dates=True)
        logger.info(f"Data loaded from {filename}")
        return data


def main():
    """Example usage"""
    from utils import setup_logging
    setup_logging(level="INFO")
    
    # Magnificent 7 stocks
    tickers = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'TSLA', 'META']
    
    collector = DataCollector(tickers)
    
    # Fetch price data
    prices = collector.fetch_price_data(
        start_date='2021-01-01',
        end_date='2024-12-31'
    )
    
    print(f"\nPrice data shape: {prices.shape}")
    print(f"\nFirst few rows:\n{prices.head()}")
    
    # Save data
    collector.save_data(prices, '../data/prices.csv')
    
    # Prepare LLM context example
    context = collector.prepare_llm_context(
        ticker='AAPL',
        date=pd.Timestamp('2024-01-15'),
        price_history=prices
    )
    
    print(f"\n=== LLM Context Example ===\n")
    print(context)


if __name__ == "__main__":
    main()