// --- TEST DE SEGURIDAD DE LIBRERÍA ---
(function checkLibrary() {
    if (typeof LightweightCharts === 'undefined') {
        console.error("La librería de gráficos no se ha cargado.");
        document.getElementById('lib-error').style.display = 'block';
        throw new Error("Sistema detenido: Librería faltante.");
    } else {
        console.log("✅ Motor de gráficos cargado correctamente.");
    }
})();

// ... (Aquí continúa el resto de tu código script.js que ya tienes)
// --- CONFIGURACIÓN DE LA PLATAFORMA ---
const CONFIG = {
    ema_fast: 9,
    ema_slow: 21,
    rsi_period: 14,
    update_ms: 60000 
};

const ASSETS = {
    'BTC': { type: 'crypto', id: 'bitcoin', symbol: 'BTC-USD', name: 'Bitcoin' },
    'ETH': { type: 'crypto', id: 'ethereum', symbol: 'ETH-USD', name: 'Ethereum' },
    'GOLD': { type: 'yahoo', symbol: 'GC=F', name: 'Oro (Futures)' },
    'US30': { type: 'yahoo', symbol: '^DJI', name: 'Dow Jones 30' },
    'SP500': { type: 'yahoo', symbol: '^GSPC', name: 'S&P 500' },
    'EURUSD': { type: 'yahoo', symbol: 'EURUSD=X', name: 'EUR/USD' },
    'GBPUSD': { type: 'yahoo', symbol: 'GBPUSD=X', name: 'GBP/USD' },
    'USDJPY': { type: 'yahoo', symbol: 'USDJPY=X', name: 'USD/JPY' }
};

let currentAssetKey = 'BTC';

const chartElement = document.getElementById('main-chart');
const statusBanner = document.getElementById('status-banner');
const signalText = document.getElementById('signal-text');
const assetNameEl = document.getElementById('asset-name');
const priceEl = document.getElementById('current-price');
const rsiEl = document.getElementById('rsi-value');
const selector = document.getElementById('asset-selector');

// --- INICIAR GRÁFICO ---
const chart = LightweightCharts.createChart(chartElement, {
    width: chartElement.offsetWidth,
    height: chartElement.offsetHeight,
    layout: { background: { type: 'solid', color: '#020408' }, textColor: '#d1d4dc' },
    grid: { vertLines: { color: '#1a1e26' }, horzLines: { color: '#1a1e26' } },
    timeScale: { timeVisible: true, secondsVisible: false, borderColor: '#30363d' },
    rightPriceScale: { borderColor: '#30363d' }
});

const candleSeries = chart.addCandlestickSeries({
    upColor: '#39d353', downColor: '#ff3e3e',
    borderUpColor: '#39d353', borderDownColor: '#ff3e3e',
    wickUpColor: '#39d353', wickDownColor: '#ff3e3e',
});

const emaFastSeries = chart.addLineSeries({ color: '#00bcd4', lineWidth: 2, title: 'EMA Rápida' });
const emaSlowSeries = chart.addLineSeries({ color: '#ffa726', lineWidth: 2, title: 'EMA Lenta' });

// --- GESTOR DE DATOS ---
async function fetchMarketData() {
    const asset = ASSETS[currentAssetKey];
    assetNameEl.innerText = asset.name || asset.symbol;
    signalText.innerText = "SINCRONIZANDO MERCADO...";

    try {
        let candles = [];
        if (asset.type === 'crypto') {
            candles = await getCryptoData(asset.id);
        } else if (asset.type === 'yahoo') {
            candles = await getYahooData(asset.symbol);
        }

        if (!candles || candles.length === 0) throw new Error("Sin datos");

        candleSeries.setData(candles);

        const emaFast = calculateEMA(candles, CONFIG.ema_fast);
        const emaSlow = calculateEMA(candles, CONFIG.ema_slow);
        const rsiValues = calculateRSI(candles, CONFIG.rsi_period);

        emaFastSeries.setData(emaFast);
        emaSlowSeries.setData(emaSlow);

        const lastPrice = candles[candles.length - 1].close;
        const lastRSI = rsiValues[rsiValues.length - 1].value;
        
        priceEl.innerText = `$${lastPrice.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
        rsiEl.innerText = lastRSI.toFixed(2);

        updateSignal(emaFast, emaSlow, lastRSI);

    } catch (error) {
        console.error("Error de Red:", error);
        signalText.innerText = "RECONECTANDO...";
        statusBanner.className = "neutral";
    }
}

// --- CONECTOR CRYPTO (CoinGecko) ---
async function getCryptoData(coinId) {
    const res = await fetch(`https://api.coingecko.com/api/v3/coins/${coinId}/ohlc?vs_currency=usd&days=1`);
    const data = await res.json();
    return data.map(d => ({
        time: d[0] / 1000,
        open: d[1], high: d[2], low: d[3], close: d[4]
    }));
}

// --- CONECTOR YAHOO (Proxy AllOrigins) ---
async function getYahooData(symbol) {
    const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=15m&range=2d`;
    const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(yahooUrl)}`;

    const res = await fetch(proxyUrl);
    const json = await res.json();
    const result = json.chart.result[0];
    const quote = result.indicators.quote[0];
    const ts = result.timestamp;

    return ts.map((t, i) => ({
        time: t,
        open: quote.open[i], high: quote.high[i], low: quote.low[i], close: quote.close[i]
    })).filter(c => c.open != null);
}

// --- CÁLCULOS MATEMÁTICOS ---
function calculateEMA(data, period) {
    let k = 2 / (period + 1);
    let emaArray = [];
    let ema = data[0].close;
    for (let i = 0; i < data.length; i++) {
        ema = (data[i].close * k) + (ema * (1 - k));
        if (i >= period) emaArray.push({ time: data[i].time, value: ema });
    }
    return emaArray;
}

function calculateRSI(data, period) {
    let rsiArray = [];
    let gains = 0, losses = 0;

    for (let i = 1; i <= period; i++) {
        let diff = data[i].close - data[i - 1].close;
        if (diff >= 0) gains += diff; else losses -= diff;
    }

    let avgGain = gains / period;
    let avgLoss = losses / period;

    for (let i = period + 1; i < data.length; i++) {
        let diff = data[i].close - data[i - 1].close;
        let gain = diff >= 0 ? diff : 0;
        let loss = diff < 0 ? -diff : 0;

        avgGain = (avgGain * (period - 1) + gain) / period;
        avgLoss = (avgLoss * (period - 1) + loss) / period;

        let rs = avgGain / avgLoss;
        let rsi = 100 - (100 / (1 + rs));
        rsiArray.push({ time: data[i].time, value: rsi });
    }
    return rsiArray;
}

// --- LÓGICA DE SEÑAL ---
function updateSignal(emaFData, emaSData, rsi) {
    const lastF = emaFData[emaFData.length - 1].value;
    const lastS = emaSData[emaSData.length - 1].value;

    if (lastF > lastS && rsi < 70) {
        statusBanner.className = 'buy';
        signalText.innerText = `🟢 COMPRAR ${currentAssetKey}`;
    } else if (lastF < lastS && rsi > 30) {
        statusBanner.className = 'sell';
        signalText.innerText = `🔴 VENDER ${currentAssetKey}`;
    } else {
        statusBanner.className = 'neutral';
        signalText.innerText = `⚪ MERCADO NEUTRAL (${currentAssetKey})`;
    }
}

// --- EVENTOS ---
selector.addEventListener('change', (e) => {
    currentAssetKey = e.target.value;
    fetchMarketData();
});

window.addEventListener('resize', () => {
    chart.applyOptions({ width: chartElement.offsetWidth, height: chartElement.offsetHeight });
});

fetchMarketData();
setInterval(fetchMarketData, CONFIG.update_ms);
