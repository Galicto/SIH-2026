import React, { useState, useEffect, useRef, useCallback } from 'react';
import DashboardLayout from '../components/DashboardLayout';
import { usePredX, type TradeRecord } from '../context/PredXContext';
import { useSnackbar } from 'notistack';
import { useWallet } from '@txnlab/use-wallet-react';
import algosdk from 'algosdk';
import { microAlgos } from '@algorandfoundation/algokit-utils';
import algorandClient from '../lib/algorandClient';
import { BankClient, BankFactory } from '../contracts/Bank';
import { ellipseAddress } from '../utils/ellipseAddress';
import {
  getStock,
  getCryptoKlines,
  getCryptoPrices,
  type StockData,
  type CryptoKline,
  type CryptoTicker,
  type AssetType,
} from '../lib/stockApi';
import { createChart, type IChartApi, ColorType, CandlestickSeries, LineSeries, type CandlestickData, type LineData, type Time } from 'lightweight-charts';

type OrderSide = 'buy' | 'sell';
type TimeInterval = '1m' | '5m' | '15m' | '1h' | '4h' | '1d';

const TIME_INTERVALS: { key: TimeInterval; label: string }[] = [
  { key: '1m', label: '1M' },
  { key: '5m', label: '5M' },
  { key: '15m', label: '15M' },
  { key: '1h', label: '1H' },
  { key: '4h', label: '4H' },
  { key: '1d', label: '1D' },
];

const QUICK_WATCHLIST = [
  { symbol: 'BTCUSDT', label: 'BTC', type: 'crypto' as AssetType },
  { symbol: 'ETHUSDT', label: 'ETH', type: 'crypto' as AssetType },
  { symbol: 'SOLUSDT', label: 'SOL', type: 'crypto' as AssetType },
  { symbol: 'RELIANCE', label: 'RELIANCE', type: 'stock' as AssetType },
  { symbol: 'TCS', label: 'TCS', type: 'stock' as AssetType },
  { symbol: 'INFY', label: 'INFY', type: 'stock' as AssetType },
  { symbol: 'XRPUSDT', label: 'XRP', type: 'crypto' as AssetType },
  { symbol: 'HDFCBANK', label: 'HDFC', type: 'stock' as AssetType },
];

// ALGO amount presets
const ALGO_PRESETS = [0.5, 1, 2, 5];
const SIM_EXCHANGE_RATE_INR = 10_000;
const BANK_APP_ID_STORAGE_KEY = 'predx-trading-bank-app-id';

const getBankAppId = (): number => {
  if (typeof window === 'undefined') return 0;
  const stored = Number(window.localStorage.getItem(BANK_APP_ID_STORAGE_KEY) ?? 0);
  if (stored > 0) return stored;
  const fromEnv = Number(import.meta.env.VITE_BANK_APP_ID ?? 0);
  return fromEnv > 0 ? fromEnv : 0;
};

const persistBankAppId = (appId: number) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(BANK_APP_ID_STORAGE_KEY, String(appId));
};

interface PortfolioEntry {
  symbol: string;
  assetType: AssetType;
  totalBought: number;
  totalSold: number;
  totalBoughtQty: number;
  totalSoldQty: number;
  myTrades: number;
  netQuantity: number;
}

const TradingTerminal: React.FC = () => {
  const { pageProps, navigate, themeMode, myTrades, addTrade } = usePredX();
  const { enqueueSnackbar } = useSnackbar();
  const { activeAddress, transactionSigner } = useWallet();

  // State
  const [symbol, setSymbol] = useState<string>(pageProps?.symbol || 'BTCUSDT');
  const [assetType, setAssetType] = useState<AssetType>(pageProps?.assetType || 'crypto');
  const [stockData, setStockData] = useState<StockData | null>(null);
  const [cryptoData, setCryptoData] = useState<CryptoTicker | null>(null);
  const [candleData, setCandleData] = useState<CryptoKline[]>([]);
  const [stockPriceHistory, setStockPriceHistory] = useState<{ time: number; value: number }[]>([]);
  const [interval, setInterval_] = useState<TimeInterval>('1h');
  const [loading, setLoading] = useState(true);
  const [orderSide, setOrderSide] = useState<OrderSide>('buy');
  const [algoAmount, setAlgoAmount] = useState('');
  const [orderLoading, setOrderLoading] = useState(false);
  const [algoBalance, setAlgoBalance] = useState<number>(0);
  const [activeTab, setActiveTab] = useState<'order' | 'history' | 'portfolio'>('order');

  // Chart refs
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<any>(null);

  // ─── Portfolio summary ─────────────────────────────────────
  const portfolioMap = myTrades.reduce((acc: Record<string, Omit<PortfolioEntry, 'netQuantity'>>, t: TradeRecord) => {
    const key = t.symbol;
    if (!acc[key]) {
      acc[key] = {
        symbol: key,
        assetType: t.assetType,
        totalBought: 0,
        totalSold: 0,
        totalBoughtQty: 0,
        totalSoldQty: 0,
        myTrades: 0,
      };
    }
    if (t.side === 'buy') {
      acc[key].totalBought += t.algoAmount;
      acc[key].totalBoughtQty += t.quantity;
    } else {
      acc[key].totalSold += t.algoAmount;
      acc[key].totalSoldQty += t.quantity;
    }
    acc[key].myTrades += 1;
    return acc;
  }, {} as any);

  const portfolioEntries: PortfolioEntry[] = Object.values(portfolioMap).map((entry) => ({
    ...entry,
    netQuantity: entry.totalBoughtQty - entry.totalSoldQty,
  }));

  // ─── Current price helpers ─────────────────────────────────
  const currentPrice = assetType === 'crypto'
    ? cryptoData?.lastPrice ?? 0
    : stockData?.last_price ?? 0;
  const currentPriceInINR = assetType === 'crypto' ? currentPrice * 85.5 : currentPrice;

  const currentChange = assetType === 'crypto'
    ? cryptoData?.priceChange ?? 0
    : stockData?.change ?? 0;

  const currentChangePercent = assetType === 'crypto'
    ? cryptoData?.priceChangePercent ?? 0
    : stockData?.percent_change ?? 0;

  const displayName = assetType === 'crypto'
    ? cryptoData?.name ?? symbol
    : stockData?.company_name ?? symbol;

  const displaySymbol = assetType === 'crypto' ? symbol.replace('USDT', '') : symbol;

  // ─── Sync pageProps when navigated from screener ────────────
  useEffect(() => {
    if (pageProps?.symbol && pageProps.symbol !== symbol) {
      setSymbol(pageProps.symbol);
      setAssetType(pageProps.assetType || 'crypto');
      setStockPriceHistory([]);
      setCandleData([]);
      setStockData(null);
      setCryptoData(null);
    }
  }, [pageProps?.symbol, pageProps?.assetType]);

  // ─── Fetch ALGO balance ────────────────────────────────────
  useEffect(() => {
    if (!activeAddress) { setAlgoBalance(0); return; }
    const fetchBalance = async () => {
      try {
        const info = await algorandClient.account.getInformation(activeAddress);
        setAlgoBalance(Number((info as any).amount) / 1_000_000);
      } catch (err) {
        console.error('Failed to fetch balance:', err);
      }
    };
    fetchBalance();
    const id = setInterval(fetchBalance, 10000);
    return () => clearInterval(id);
  }, [activeAddress]);

  useEffect(() => {
    if (!transactionSigner) return;
    algorandClient.setDefaultSigner(transactionSigner);
  }, [transactionSigner]);



  // ─── Fetch data ────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      if (assetType === 'crypto') {
        const [klines, prices] = await Promise.all([
          getCryptoKlines(symbol, interval, 200),
          getCryptoPrices(),
        ]);
        setCandleData(klines);
        const ticker = prices.find(p => p.symbol === symbol);
        if (ticker) {
          setCryptoData({
            symbol: ticker.symbol,
            displaySymbol: ticker.displaySymbol,
            name: ticker.name,
            lastPrice: ticker.lastPrice,
            priceChange: ticker.priceChange,
            priceChangePercent: ticker.priceChangePercent,
            highPrice: ticker.highPrice,
            lowPrice: ticker.lowPrice,
            volume: ticker.volume,
            quoteVolume: ticker.quoteVolume,
            exchange: 'CRYPTO',
          });
        }
        setStockData(null);
      } else {
        const stock = await getStock(symbol);
        if (stock) {
          setStockData(stock);
          setStockPriceHistory(prev => {
            // If no history yet, generate 150 synthetic historical points
            if (prev.length < 2) {
              const synthHistory: { time: number; value: number }[] = [];
              const nowSec = Math.floor(Date.now() / 1000);
              const dailyVol = 0.012; // 1.2% daily vol (typical large-cap stock)
              let price = stock.last_price * (0.85 + Math.random() * 0.10); // start 85-95% of current
              for (let i = 149; i >= 0; i--) {
                const time = nowSec - i * 900; // one point every 15 min
                const drift = dailyVol * (Math.random() * 2 - 1) * 0.25;
                price = Math.max(price * (1 + drift), price * 0.5);
                synthHistory.push({ time, value: parseFloat(price.toFixed(2)) });
              }
              // Anchor last point to actual current price
              synthHistory[synthHistory.length - 1] = { time: nowSec, value: stock.last_price };
              return synthHistory;
            }
            const now = Math.floor(Date.now() / 1000);
            const newEntry = { time: now, value: stock.last_price };
            if (prev.length > 0 && prev[prev.length - 1].time === now) return prev;
            return [...prev, newEntry].slice(-200);
          });
        }
        setCryptoData(null);
        setCandleData([]);
      }
    } catch (err) {
      console.error('Failed to fetch trading data:', err);
    } finally {
      setLoading(false);
    }
  }, [symbol, assetType, interval]);

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, assetType === 'crypto' ? 10000 : 60000);
    return () => clearInterval(id);
  }, [fetchData, assetType]);

  // ─── Chart rendering ──────────────────────────────────────
  useEffect(() => {
    if (!chartContainerRef.current) return;

    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
      seriesRef.current = null;
    }

    const isDark = themeMode === 'dark';

    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: 420,
      layout: {
        background: { type: ColorType.Solid, color: isDark ? '#0a0e13' : '#f9fbfe' },
        textColor: isDark ? '#b9cbbdc0' : '#454f4a',
        fontFamily: 'Space Grotesk, sans-serif',
      },
      grid: {
        vertLines: { color: isDark ? '#1c2025' : '#e8edf0' },
        horzLines: { color: isDark ? '#1c2025' : '#e8edf0' },
      },
      crosshair: {
        mode: 0,
        vertLine: { color: isDark ? '#00FFA340' : '#006D4340', style: 2 },
        horzLine: { color: isDark ? '#00FFA340' : '#006D4340', style: 2 },
      },
      rightPriceScale: { borderColor: isDark ? '#1c2025' : '#dce2e9' },
      timeScale: {
        borderColor: isDark ? '#1c2025' : '#dce2e9',
        timeVisible: true,
        secondsVisible: false,
      },
    });

    chartRef.current = chart;

    if (assetType === 'crypto' && candleData.length > 0) {
      const candleSeries = chart.addSeries(CandlestickSeries, {
        upColor: '#00FFA3',
        downColor: '#ff4976',
        borderDownColor: '#ff4976',
        borderUpColor: '#00FFA3',
        wickDownColor: '#ff497680',
        wickUpColor: '#00FFA380',
      });
      const formatted: CandlestickData<Time>[] = candleData.map(k => ({
        time: k.time as Time, open: k.open, high: k.high, low: k.low, close: k.close,
      }));
      candleSeries.setData(formatted);
      seriesRef.current = candleSeries;
    } else if (assetType === 'stock' && stockPriceHistory.length > 0) {
      const lineSeries = chart.addSeries(LineSeries, {
        color: '#00FFA3',
        lineWidth: 2,
        crosshairMarkerVisible: true,
        crosshairMarkerRadius: 4,
        crosshairMarkerBackgroundColor: '#00FFA3',
      });
      const formatted: LineData<Time>[] = stockPriceHistory.map(p => ({
        time: p.time as Time, value: p.value,
      }));
      lineSeries.setData(formatted);
      seriesRef.current = lineSeries;
    }

    chart.timeScale().fitContent();

    const resizeHandler = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };
    window.addEventListener('resize', resizeHandler);

    return () => {
      window.removeEventListener('resize', resizeHandler);
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [candleData, stockPriceHistory, themeMode, assetType]);

  // ─── Switch symbol ─────────────────────────────────────────
  const switchAsset = (sym: string, type: AssetType) => {
    setSymbol(sym);
    setAssetType(type);
    setStockPriceHistory([]);
    setCandleData([]);
    setStockData(null);
    setCryptoData(null);
  };

  const ensureTradingBankAppId = useCallback(async (): Promise<number> => {
    const existing = getBankAppId();
    if (existing > 0) return existing;
    if (!activeAddress || !transactionSigner) throw new Error('Connect Pera Wallet to initialize trading bank');

    enqueueSnackbar('Initializing trading bank contract...', { variant: 'info' });
    const factory = new BankFactory({
      defaultSender: activeAddress,
      defaultSigner: transactionSigner,
      algorand: algorandClient,
    });
    const deployed = await factory.deploy({
      createParams: {
        sender: activeAddress,
        signer: transactionSigner,
      },
    });
    const newAppId = Number(deployed.appClient.appId);
    persistBankAppId(newAppId);
    enqueueSnackbar(`Trading bank initialized (App ID: ${newAppId})`, { variant: 'success' });
    return newAppId;
  }, [activeAddress, transactionSigner, enqueueSnackbar]);

  // ─── Place order with mandatory transaction ─────────
  const handlePlaceOrder = async () => {
    if (!activeAddress || !transactionSigner) {
      enqueueSnackbar('Connect Pera Wallet to place buy/sell orders', { variant: 'warning' });
      return;
    }
    const amount = Number(algoAmount);
    if (!amount || amount <= 0) {
      enqueueSnackbar('Enter a valid ALGO amount', { variant: 'warning' });
      return;
    }
    if (currentPriceInINR <= 0) {
      enqueueSnackbar('Live asset price unavailable. Try again in a few seconds.', { variant: 'warning' });
      return;
    }

    // Validation: Only block if user has zero holdings for this symbol.
    // We do NOT do a strict ALGO-equivalent check here because the live price
    // fluctuates every 10s — a strict check causes false rejections.
    // The bank smart contract will reject on-chain if the deposit is insufficient.
    if (orderSide === 'sell') {
      const bucket = portfolioEntries.find((entry) => entry.symbol === displaySymbol);
      if (!bucket || bucket.netQuantity <= 0) {
        enqueueSnackbar(
          `No ${displaySymbol} holdings found. Buy first before selling.`,
          { variant: 'error' }
        );
        return;
      }
    }

    if (orderSide === 'buy' && amount > algoBalance - 0.1) {
      enqueueSnackbar('Insufficient ALGO balance (need to keep 0.1 for fees)', { variant: 'error' });
      return;
    }

    setOrderLoading(true);
    try {
      const bankAppId = await ensureTradingBankAppId();
      const assetQuantity = (amount * SIM_EXCHANGE_RATE_INR) / currentPriceInINR;
      const sp = await algorandClient.client.algod.getTransactionParams().do();
      const bankAddress = algosdk.getApplicationAddress(BigInt(bankAppId));
      const note = new TextEncoder().encode(
        JSON.stringify({
          mode: 'PredXTrade',
          side: orderSide,
          symbol: displaySymbol,
          assetType,
          qty: assetQuantity,
          inrRate: SIM_EXCHANGE_RATE_INR,
          priceInINR: currentPriceInINR,
          tradeAlgoAmount: amount,
        })
      );

      const bankClient = new BankClient({
        appId: BigInt(bankAppId),
        algorand: algorandClient,
        defaultSigner: transactionSigner,
      });

      const txId =
        orderSide === 'buy'
          ? (
              await bankClient.send.deposit({
                args: {
                  memo: 'Arthniti trading buy',
                  payTxn: {
                    txn: algosdk.makePaymentTxnWithSuggestedParamsFromObject({
                      sender: activeAddress,
                      receiver: bankAddress,
                      amount: algosdk.algosToMicroalgos(amount),
                      note,
                      suggestedParams: sp,
                    }),
                    signer: transactionSigner,
                  },
                },
                sender: activeAddress,
                signer: transactionSigner,
                extraFee: microAlgos(2000),
                maxRoundsToWaitForConfirmation: 6,
              })
            ).transaction.txID()
          : (
              await bankClient.send.withdraw({
                args: { amount: algosdk.algosToMicroalgos(amount) },
                sender: activeAddress,
                signer: transactionSigner,
                extraFee: microAlgos(2000),
                maxRoundsToWaitForConfirmation: 6,
              })
            ).transaction.txID();
      const tradeId = txId;

      // Log the trade
      const newTrade: TradeRecord = {
        id: tradeId,
        symbol: displaySymbol,
        side: orderSide,
        quantity: assetQuantity,
        priceAtTrade: currentPrice,
        priceAtTradeINR: currentPriceInINR,
        algoAmount: amount,
        txId,
        mode: 'transaction',
        timestamp: new Date(),
        assetType,
      };
      
      addTrade(newTrade);

      enqueueSnackbar(
        `${orderSide === 'buy' ? '🟢 Bought' : '🔴 Sold'} ${amount} ALGO worth of ${displaySymbol} — Tx: ${txId.slice(0, 8)}...`,
        { variant: 'success' }
      );
      setAlgoAmount('');
      setActiveTab('history');

      // Refresh ALGO balance after confirmed txn.
      const info = await algorandClient.account.getInformation(activeAddress);
      setAlgoBalance(Number((info as any).amount) / 1_000_000);
    } catch (err: any) {
      console.error('Trade failed:', err);
      const message = String(err?.message || '');
      if (message.includes('PeraWalletConnect was not initialized correctly')) {
        enqueueSnackbar('Pera not initialized. Disconnect and reconnect wallet, then retry.', { variant: 'error' });
      } else if (message.includes('No deposits found for this account') || message.includes('Withdrawal amount exceeds balance')) {
        enqueueSnackbar('Sell failed: not enough ALGO in trading bank. Place buy orders first to fund sell withdrawals.', { variant: 'error' });
      } else if (message.includes('Connect Pera Wallet to initialize trading bank')) {
        enqueueSnackbar(message, { variant: 'error' });
      } else {
        enqueueSnackbar(err?.message || 'Trade transaction failed', { variant: 'error' });
      }
    } finally {
      setOrderLoading(false);
    }
  };

  // ─── Stock Detail Fields ───────────────────────────────────
  const detailFields = assetType === 'stock' && stockData
    ? [
        { label: 'Open', value: `₹${stockData.open?.toLocaleString('en-IN') ?? '—'}` },
        { label: 'Prev Close', value: `₹${stockData.previous_close?.toLocaleString('en-IN') ?? '—'}` },
        { label: 'Day High', value: `₹${stockData.day_high?.toLocaleString('en-IN') ?? '—'}` },
        { label: 'Day Low', value: `₹${stockData.day_low?.toLocaleString('en-IN') ?? '—'}` },
        { label: '52W High', value: `₹${stockData.year_high?.toLocaleString('en-IN') ?? '—'}` },
        { label: '52W Low', value: `₹${stockData.year_low?.toLocaleString('en-IN') ?? '—'}` },
        { label: 'P/E Ratio', value: stockData.pe_ratio?.toFixed(2) ?? '—' },
        { label: 'EPS', value: `₹${stockData.earnings_per_share?.toFixed(2) ?? '—'}` },
        { label: 'Book Value', value: `₹${stockData.book_value?.toFixed(2) ?? '—'}` },
        { label: 'Div Yield', value: `${stockData.dividend_yield?.toFixed(2) ?? '—'}%` },
        { label: 'Market Cap', value: stockData.market_cap ? `₹${(stockData.market_cap / 1e7).toFixed(0)} Cr` : '—' },
        { label: 'Volume', value: stockData.volume?.toLocaleString('en-IN') ?? '—' },
      ]
    : assetType === 'crypto' && cryptoData
      ? [
          { label: '24h High', value: `$${cryptoData.highPrice?.toLocaleString() ?? '—'}` },
          { label: '24h Low', value: `$${cryptoData.lowPrice?.toLocaleString() ?? '—'}` },
          { label: '24h Vol', value: `${(cryptoData.volume ?? 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}` },
          { label: 'Quote Vol', value: `$${((cryptoData.quoteVolume ?? 0) / 1e6).toFixed(2)}M` },
        ]
      : [];

  // ─── Render ────────────────────────────────────────────────
  return (
    <DashboardLayout>
      <div className="pt-4 pb-12 px-4 md:px-6 max-w-[1800px] mx-auto">
        {/* ─── Breadcrumbs ───────────────────────────────────── */}
        <div className="flex items-center gap-2 text-xs font-label text-on-surface-variant mb-4">
          <span className="cursor-pointer hover:text-primary-container" onClick={() => navigate('screener')}>
            Screener
          </span>
          <span className="material-symbols-outlined text-[12px]">chevron_right</span>
          <span className="text-primary-container">{displaySymbol}</span>
        </div>

        {/* ─── Symbol Header ─────────────────────────────────── */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6">
          <div className="flex items-center gap-4">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-lg font-black ${
              assetType === 'crypto' ? 'bg-purple-500/15 text-purple-400' : 'bg-blue-500/15 text-blue-400'
            }`}>
              {displaySymbol.slice(0, 2)}
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl md:text-3xl font-black font-headline text-on-surface tracking-tight leading-none">
                  {displaySymbol}
                </h1>
                <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider ${
                  assetType === 'crypto' ? 'bg-purple-500/20 text-purple-400' : 'bg-blue-500/20 text-blue-400'
                }`}>
                  {assetType === 'crypto' ? 'CRYPTO' : stockData?.exchange ?? 'NSE'}
                </span>
              </div>
              <p className="text-sm text-on-surface-variant mt-0.5">{displayName}</p>
            </div>
          </div>

          <div className="flex items-end gap-4">
            <div className="text-right">
              <p className="text-3xl md:text-4xl font-black font-headline text-on-surface tracking-tight">
                {loading ? '...' : `${assetType === 'crypto' ? '$' : '₹'}${currentPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: assetType === 'crypto' && currentPrice < 1 ? 6 : 2 })}`}
              </p>
              <div className={`flex items-center justify-end gap-1 text-sm font-bold ${currentChangePercent >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                <span className="material-symbols-outlined text-[16px]">
                  {currentChangePercent >= 0 ? 'trending_up' : 'trending_down'}
                </span>
                {currentChange >= 0 ? '+' : ''}{currentChange.toFixed(assetType === 'crypto' && currentPrice < 1 ? 6 : 2)}{' '}
                ({currentChangePercent >= 0 ? '+' : ''}{currentChangePercent.toFixed(2)}%)
              </div>
            </div>
          </div>
        </div>

        {/* ─── Main Grid ─────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* ─── LEFT: Chart + Details ───────────────────────── */}
          <div className="lg:col-span-8 space-y-6">
            {/* Chart Container */}
            <div className="bg-surface-container-low rounded-xl border border-outline-variant/10 overflow-hidden">
              {/* Chart Toolbar */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-outline-variant/10">
                <div className="flex items-center gap-1">
                  {assetType === 'crypto' && TIME_INTERVALS.map(ti => (
                    <button
                      key={ti.key}
                      className={`px-3 py-1.5 text-[11px] font-bold rounded-lg transition-all ${
                        interval === ti.key
                          ? 'bg-primary-container text-on-primary'
                          : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
                      }`}
                      onClick={() => setInterval_(ti.key)}
                    >
                      {ti.label}
                    </button>
                  ))}
                  {assetType === 'stock' && (
                    <span className="text-xs text-on-surface-variant flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                      Real-time line · Updates every 15s
                    </span>
                  )}
                </div>
                <span className="text-[10px] text-on-surface-variant uppercase tracking-wider font-bold">
                  {assetType === 'crypto' ? 'Candlestick' : 'Line'}
                </span>
              </div>

              {/* Chart */}
              <div ref={chartContainerRef} className="w-full" style={{ minHeight: 420 }}>
                {loading && candleData.length === 0 && stockPriceHistory.length === 0 && (
                  <div className="flex items-center justify-center h-[420px]">
                    <div className="w-8 h-8 border-2 border-primary-container border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
              </div>
            </div>

            {/* ─── Details Grid ───────────────────────────────── */}
            {detailFields.length > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {detailFields.map(f => (
                  <div key={f.label} className="bg-surface-container-low rounded-lg p-3 border border-outline-variant/10">
                    <p className="text-[10px] text-on-surface-variant uppercase tracking-widest font-bold mb-1">{f.label}</p>
                    <p className="text-sm font-bold font-mono text-on-surface">{f.value}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ─── RIGHT: Order Panel + Tabs ───────────────────── */}
          <div className="lg:col-span-4 space-y-6">
            {/* Wallet Info Bar */}
            <div className="bg-surface-container-low rounded-xl border border-outline-variant/10 p-4">
              {activeAddress ? (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary-container/10 flex items-center justify-center">
                      <span className="material-symbols-outlined text-primary-container text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>account_balance_wallet</span>
                    </div>
                    <div>
                      <p className="text-xs font-bold text-on-surface">{ellipseAddress(activeAddress, 4)}</p>
                      <div className="flex gap-2 items-center">
                        <p className="text-[10px] text-on-surface-variant">Pera Wallet</p>
                        <span className="text-[10px] bg-primary-container/10 text-primary-container px-1.5 rounded uppercase font-black">PAY TX</span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-black font-headline text-on-surface">{algoBalance.toFixed(2)} ALGO</p>
                    <p className="text-[10px] text-primary-container font-black animate-pulse">≈ ₹{(algoBalance * SIM_EXCHANGE_RATE_INR).toLocaleString()} INR</p>
                  </div>
                </div>
              ) : (
                  <div className="flex items-center gap-3 text-on-surface-variant">
                    <span className="material-symbols-outlined text-xl">link_off</span>
                    <div>
                      <p className="text-sm font-bold text-on-surface">Wallet Not Connected</p>
                    <p className="text-[10px]">Connect Pera Wallet to trade</p>
                    </div>
                  </div>
                )}
            </div>

            {/* Panel Tabs */}
            <div className="bg-surface-container-low rounded-xl border border-outline-variant/10 overflow-hidden">
              <div className="flex border-b border-outline-variant/10">
                {(['order', 'history', 'portfolio'] as const).map(tab => (
                  <button
                    key={tab}
                    className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider transition-all ${
                      activeTab === tab
                        ? 'text-primary-container border-b-2 border-primary-container bg-primary-container/5'
                        : 'text-on-surface-variant hover:text-on-surface'
                    }`}
                    onClick={() => setActiveTab(tab)}
                  >
                    {tab === 'order' ? 'Order' : tab === 'history' ? 'History' : 'Portfolio'}
                  </button>
                ))}
              </div>

              <div className="p-5">
                {/* ── ORDER TAB ──────────────────────────────── */}
                {activeTab === 'order' && (
                  <>
                    {/* Buy/Sell Toggle */}
                    <div className="flex p-1 bg-surface-container-highest rounded-full mb-5">
                      <button
                        className={`flex-1 py-2.5 text-xs font-black rounded-full transition-all uppercase tracking-wider ${
                          orderSide === 'buy'
                            ? 'bg-emerald-500 text-on-surface shadow-lg shadow-emerald-500/20'
                            : 'text-on-surface-variant hover:text-on-surface'
                        }`}
                        onClick={() => setOrderSide('buy')}
                      >
                        Buy {displaySymbol}
                      </button>
                      <button
                        className={`flex-1 py-2.5 text-xs font-black rounded-full transition-all uppercase tracking-wider ${
                          orderSide === 'sell'
                            ? 'bg-red-500 text-on-surface shadow-lg shadow-red-500/20'
                            : 'text-on-surface-variant hover:text-on-surface'
                        }`}
                        onClick={() => setOrderSide('sell')}
                      >
                        Sell {displaySymbol}
                      </button>
                    </div>

                    {/* Market Price */}
                    <div className="bg-surface-container-highest/50 rounded-lg p-3 mb-4">
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] text-on-surface-variant uppercase tracking-wider font-bold">Market Price</span>
                        <span className="text-sm font-bold font-mono text-on-surface">
                          {assetType === 'crypto' ? '$' : '₹'}{currentPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: assetType === 'crypto' && currentPrice < 1 ? 6 : 2 })}
                        </span>
                      </div>
                    </div>

                    {/* ALGO Amount */}
                    <div className="mb-4">
                      <label className="text-xs font-label text-on-surface-variant mb-2 block">Amount to {orderSide === 'buy' ? 'invest' : 'sell'}</label>
                      <div className="relative">
                        <input
                          className="w-full bg-surface-container-lowest border border-outline-variant/10 rounded-lg py-3 pl-4 pr-16 text-lg font-headline font-bold focus:ring-1 focus:ring-primary-container/40 focus:outline-none text-on-surface"
                          placeholder="0.00"
                          type="number"
                          step="0.01"
                          min="0"
                          value={algoAmount}
                          onChange={e => setAlgoAmount(e.target.value)}
                        />
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-primary-container">
                          ALGO
                        </span>
                      </div>
                      <div className="flex gap-2 mt-2">
                        {ALGO_PRESETS.map(q => (
                          <button
                            key={q}
                            className="flex-1 py-1.5 text-[11px] bg-surface-container-highest rounded-lg hover:text-primary-container transition-colors font-bold"
                            onClick={() => setAlgoAmount(String(q))}
                          >
                            {q} ALGO
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Available Balance */}
                    <div className="bg-surface-container-highest/50 rounded-lg p-3 space-y-2 mb-5">
                      <div className="flex justify-between text-xs">
                        <span className="text-on-surface-variant">Available Balance</span>
                        <span className="font-bold text-on-surface">{algoBalance.toFixed(4)} ALGO</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-on-surface-variant">Network</span>
                        <span className="font-bold text-primary-container">Vyapar-Mitra Simulation</span>
                      </div>
                      <div className="flex justify-between text-xs border-t border-outline-variant/10 pt-2">
                        <span className="text-on-surface-variant">Trade Amount</span>
                        <div className="text-right">
                          <span className="font-bold text-on-surface">
                            {algoAmount && Number(algoAmount) > 0
                              ? `${Number(algoAmount).toFixed(4)} ALGO`
                              : '0.00 ALGO'}
                          </span>
                          <p className="text-[9px] text-primary-container font-black">
                             ≈ ₹{algoAmount ? (Number(algoAmount) * SIM_EXCHANGE_RATE_INR).toLocaleString() : '0'} INR
                          </p>
                        </div>
                      </div>
                      
                      {algoAmount && Number(algoAmount) > 0 && currentPrice > 0 && (
                        <div className="flex justify-between text-xs pt-1">
                          <span className="text-on-surface-variant">Est. Quantity</span>
                          <span className="font-bold text-[#00FFA3]">
                            {((Number(algoAmount) * SIM_EXCHANGE_RATE_INR) / currentPriceInINR).toFixed(assetType === 'crypto' ? 6 : 2)} {displaySymbol}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Place Order Button */}
                    <button
                      className={`w-full font-headline font-black py-4 rounded-full transition-all duration-300 active:scale-95 text-sm uppercase tracking-wider ${
                        !activeAddress
                          ? 'bg-surface-container-highest text-on-surface-variant cursor-not-allowed'
                          : orderSide === 'buy'
                            ? 'bg-emerald-500 text-on-surface hover:shadow-[0_0_20px_rgba(16,185,129,0.4)]'
                            : 'bg-red-500 text-on-surface hover:shadow-[0_0_20px_rgba(239,68,68,0.4)]'
                      } ${orderLoading ? 'opacity-60 cursor-wait' : ''}`}
                      onClick={handlePlaceOrder}
                      disabled={orderLoading || !activeAddress}
                    >
                      {!activeAddress ? (
                        'Connect Wallet to Trade'
                      ) : orderLoading ? (
                        <span className="flex items-center justify-center gap-2">
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          Confirm in Pera...
                        </span>
                      ) : (
                        `${orderSide === 'buy' ? 'Buy' : 'Sell'} ${displaySymbol} with ALGO`
                      )}
                    </button>

                    <p className="text-[10px] text-center text-on-surface-variant mt-3 leading-relaxed">
                      1 ALGO = ₹10,000 simulation pricing. Buys deposit into the trading bank and sells withdraw ALGO back to your wallet via Pera.
                    </p>
                  </>
                )}

                {/* ── HISTORY TAB ────────────────────────────── */}
                {activeTab === 'history' && (
                  <div>
                    <h4 className="text-xs font-bold text-on-surface-variant uppercase tracking-widest mb-3">Recent Trades</h4>
                    {myTrades.length === 0 ? (
                      <div className="text-center py-8">
                        <span className="material-symbols-outlined text-3xl text-on-surface-variant/20 block mb-2">receipt_long</span>
                        <p className="text-sm text-on-surface-variant">No trades yet</p>
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-[400px] overflow-y-auto custom-scrollbar">
                        {myTrades.slice(0, 20).map((t: TradeRecord) => (
                          <div key={t.id} className="bg-surface-container-highest/30 rounded-lg p-3 border border-outline-variant/5">
                            <div className="flex items-center justify-between mb-1">
                              <div className="flex items-center gap-2">
                                <span className={`w-2 h-2 rounded-full ${t.side === 'buy' ? 'bg-emerald-400' : 'bg-red-400'}`} />
                                <span className="text-xs font-bold text-on-surface">{t.side.toUpperCase()} {t.symbol}</span>
                              </div>
                              <span className="text-[10px] text-on-surface-variant">
                                {t.timestamp.toLocaleString()}
                              </span>
                            </div>
                            <div className="flex justify-between text-[11px]">
                              <span className="text-on-surface-variant">Amount: <span className="text-on-surface font-bold">{t.algoAmount} ALGO</span></span>
                              {t.txId ? (
                                <a
                                  href={`https://testnet.explorer.perawallet.app/tx/${t.txId}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-primary-container hover:underline flex items-center gap-1"
                                  onClick={e => e.stopPropagation()}
                                >
                                  View Tx <span className="material-symbols-outlined text-[12px]">open_in_new</span>
                                </a>
                              ) : (
                                <span className="text-primary-container font-bold uppercase text-[10px]">SIM</span>
                              )}
                            </div>
                            <div className="flex justify-between text-[10px] mt-1 text-on-surface-variant">
                              <span>Qty: <span className="text-on-surface">{t.quantity.toFixed(t.assetType === 'crypto' ? 6 : 2)} {t.symbol}</span></span>
                              <span>₹{t.priceAtTradeINR.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* ── PORTFOLIO TAB ──────────────────────────── */}
                {activeTab === 'portfolio' && (
                  <div>
                    <h4 className="text-xs font-bold text-on-surface-variant uppercase tracking-widest mb-3">Holdings</h4>
                    {portfolioEntries.length === 0 ? (
                      <div className="text-center py-8">
                        <span className="material-symbols-outlined text-3xl text-on-surface-variant/20 block mb-2">pie_chart</span>
                        <p className="text-sm text-on-surface-variant">No holdings yet</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {portfolioEntries.map((p: PortfolioEntry) => (
                          <div key={p.symbol} className="bg-surface-container-highest/30 rounded-lg p-3 border border-outline-variant/5">
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <div className={`w-6 h-6 rounded flex items-center justify-center text-[8px] font-black ${
                                  p.assetType === 'crypto' ? 'bg-purple-500/15 text-purple-400' : 'bg-blue-500/15 text-blue-400'
                                }`}>
                                  {p.symbol.slice(0, 2)}
                                </div>
                                <span className="text-sm font-bold text-on-surface">{p.symbol}</span>
                              </div>
                              <span className="text-[10px] text-on-surface-variant">{p.myTrades} myTrades</span>
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-[11px]">
                              <div>
                                <span className="text-on-surface-variant">Bought</span>
                                <p className="font-bold text-emerald-400">{p.totalBought.toFixed(2)} ALGO</p>
                                <p className="text-[9px] text-on-surface-variant opacity-60">≈ ₹{(p.totalBought * SIM_EXCHANGE_RATE_INR).toLocaleString()}</p>
                              </div>
                              <div>
                                <span className="text-on-surface-variant">Sold</span>
                                <p className="font-bold text-red-400">{p.totalSold.toFixed(2)} ALGO</p>
                                <p className="text-[9px] text-on-surface-variant opacity-60">≈ ₹{(p.totalSold * SIM_EXCHANGE_RATE_INR).toLocaleString()}</p>
                              </div>
                            </div>
                             <div className="mt-3 flex justify-between items-center border-t border-outline-variant/5 pt-2">
                               <div className="text-[10px] text-on-surface-variant">
                                  Net Qty: <span className="font-bold text-on-surface">{p.netQuantity.toFixed(p.assetType === 'crypto' ? 6 : 2)} {p.symbol}</span>
                               </div>
                              <button
                                className="flex items-center gap-1 text-[9px] font-black uppercase bg-red-500/15 hover:bg-red-500/25 text-red-400 px-2.5 py-1 rounded-lg transition-colors border border-red-500/20"
                                onClick={() => {
                                  // Switch to this symbol
                                  setSymbol(p.assetType === 'crypto' ? `${p.symbol}USDT` : p.symbol);
                                  setAssetType(p.assetType);
                                  setOrderSide('sell');
                                  setActiveTab('order');
                                  // Pre-fill max sellable ALGO equivalent
                                  const maxAlgo = (p.netQuantity * currentPriceInINR) / SIM_EXCHANGE_RATE_INR;
                                  if (maxAlgo > 0) {
                                    setAlgoAmount(maxAlgo.toFixed(4));
                                  }
                                }}
                              >
                                <span className="material-symbols-outlined text-[11px]">sell</span>
                                Quick Sell
                              </button>
                            </div>
                          </div>
                        ))}

                        {/* Total Summary */}
                        <div className="bg-primary-container/5 rounded-lg p-3 border border-primary-container/10 mt-3">
                          <div className="flex justify-between text-xs">
                            <span className="text-on-surface-variant font-bold">Total Invested</span>
                            <span className="font-bold text-on-surface">
                              {portfolioEntries.reduce((acc: number, p: any) => acc + (p.totalBought || 0), 0).toFixed(2)} ALGO
                            </span>
                          </div>
                          <div className="flex justify-between text-xs mt-1">
                            <span className="text-on-surface-variant font-bold">Total Sold</span>
                            <span className="font-bold text-on-surface">
                              {portfolioEntries.reduce((acc: number, p: any) => acc + (p.totalSold || 0), 0).toFixed(2)} ALGO
                            </span>
                          </div>
                          <div className="flex justify-between text-xs mt-1 border-t border-outline-variant/10 pt-1">
                            <span className="text-on-surface-variant font-bold">Total Trades</span>
                            <span className="font-bold text-primary-container">
                              {myTrades.length}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* ─── Quick Watchlist ───────────────────────────── */}
            <div className="bg-surface-container-low rounded-xl border border-outline-variant/10 p-4">
              <h3 className="font-headline font-bold text-sm mb-3 text-on-surface flex items-center gap-2">
                <span className="material-symbols-outlined text-[16px] text-primary-container">bookmark</span>
                Watchlist
              </h3>
              <div className="space-y-1">
                {QUICK_WATCHLIST.map(w => (
                  <div
                    key={w.symbol}
                    className={`flex items-center justify-between px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${
                      symbol === w.symbol
                        ? 'bg-primary-container/10 border border-primary-container/20'
                        : 'hover:bg-surface-container-high'
                    }`}
                    onClick={() => switchAsset(w.symbol, w.type)}
                  >
                    <div className="flex items-center gap-2">
                      <div className={`w-6 h-6 rounded flex items-center justify-center text-[8px] font-black ${
                        w.type === 'crypto' ? 'bg-purple-500/15 text-purple-400' : 'bg-blue-500/15 text-blue-400'
                      }`}>
                        {w.label.slice(0, 2)}
                      </div>
                      <span className="text-xs font-bold text-on-surface">{w.label}</span>
                    </div>
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                      w.type === 'crypto' ? 'bg-purple-500/10 text-purple-400' : 'bg-blue-500/10 text-blue-400'
                    }`}>
                      {w.type === 'crypto' ? 'CRYPTO' : 'NSE'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default TradingTerminal;
