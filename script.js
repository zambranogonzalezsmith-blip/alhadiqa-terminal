// --- SISTEMA DE AUTO-RECUPERACIÓN ALHADIQA ---
(function checkLibrary() {
    if (typeof LightweightCharts === 'undefined') {
        console.warn("⚠️ Motor local no encontrado. Activando protocolo de emergencia...");
        const backupScript = document.createElement('script');
        // Esto carga la librería desde internet si tu archivo local falla
        backupScript.src = "https://unpkg.com/lightweight-charts@4.1.1/dist/lightweight-charts.standalone.production.js";
        backupScript.onload = () => {
            console.log("✅ Motor de emergencia conectado. Iniciando terminal...");
            initTerminal(); 
        };
        document.head.appendChild(backupScript);
    } else {
        console.log("✅ Motor ALHADIQAINVEST cargado desde chart-lib.js");
        window.onload = initTerminal;
    }
})();

// --- CONFIGURACIÓN ---
const CONFIG = { ema_fast: 9, ema_slow: 21, rsi_period: 14, update_ms: 60000 };
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
let chart, candleSeries, emaFastSeries, emaSlowSeries;

// --- INICIALIZACIÓN DE LA TERMINAL ---
function initTerminal() {
    const chartElement = document.getElementById('main-chart');
    if (!chartElement) return;

    chart = LightweightCharts.createChart(chartElement, {
        width: chartElement.offsetWidth,
        height: chartElement.offsetHeight,
        layout: { background: { type: 'solid', color: '#010409' }, textColor: '#d1d4dc', fontSize: 12 },
        grid: { vertLines: { color: '#161b22' }, horzLines: { color: '#161b22' } },
        timeScale: { timeVisible: true, borderColor: '#30363d' },
        rightPriceScale: { borderColor: '#30363d' }
    });

    candleSeries = chart.addCandlestickSeries({
        upColor: '#39d353', downColor: '#ff3e3e',
        borderUpColor: '#39d353', borderDownColor: '#ff3e3e',
        wickUpColor: '#39d353', wickDownColor: '#ff3e3e',
    });

    emaFastSeries = chart.addLineSeries({ color: '#00bcd4', lineWidth: 2 });
    emaSlowSeries = chart.addLineSeries({ color: '#ffa726', lineWidth: 2 });

    fetchMarketData();
    setInterval(fetchMarketData, CONFIG.update_ms);

    window.addEventListener('resize', () => {
        chart.applyOptions({ width: chartElement.offsetWidth, height: chartElement.offsetHeight });
    });
}

// --- GESTOR DE DATOS Y SEÑALES ---
async function fetchMarketData() {
    const asset = ASSETS[currentAssetKey];
    document.getElementById('asset-name').innerText = asset.name;
    document.getElementById('signal-text').innerText = "ACTUALIZANDO...";

    try {
        let candles = (asset.type === 'crypto') ? await getCryptoData(asset.id) : await getYahooData(asset.symbol);

        if (!candles || candles.length < 2) throw new Error("Mercado cerrado");

        candleSeries.setData(candles);
        const emaF = calculateEMA(candles, CONFIG.ema_fast);
        const emaS = calculateEMA(candles, CONFIG.ema_slow);
        const rsiV = calculateRSI(candles, CONFIG.rsi_period);

        emaFastSeries.setData(emaF);
        emaSlowSeries.setData(emaS);

        const lastPrice = candles[candles.length - 1].close;
        const lastRSI = rsiV.length > 0 ? rsiV[rsiV.length - 1].value : 50;
        
        document.getElementById('current-price').innerText = `$${lastPrice.toLocaleString()}`;
        document.getElementById('rsi-value').innerText = lastRSI.toFixed(2);

        updateSignal(emaF, emaS, lastRSI);
    } catch (e) {
        document.getElementById('signal-text').innerText = "SIN DATOS / MERCADO PAUSADO";
    }
}

// --- CONECTORES (Iguales a los anteriores pero con manejo de errores) ---
async function getCryptoData(id) {
    const r = await fetch(`https://api.coingecko.com/api/v3/coins/${id}/ohlc?vs_currency=usd&days=1`);
    return (await r.json()).map(d => ({ time: d[0]/1000, open: d[1], high: d[2], low: d[3], close: d[4] }));
}

async function getYahooData(s) {
    const u = `https://query1.finance.yahoo.com/v8/finance/chart/${s}?interval=15m&range=2d`;
    const p = `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`;
    const r = await fetch(p);
    const j = await r.json();
    const res = j.chart.result[0];
    return res.timestamp.map((t, i) => ({
        time: t, open: res.indicators.quote[0].open[i], high: res.indicators.quote[0].high[i],
        low: res.indicators.quote[0].low[i], close: res.indicators.quote[0].close[i]
    })).filter(c => c.open != null);
}

// --- MATEMÁTICAS ---
function calculateEMA(data, p) {
    let k = 2/(p+1), emaArr = [], ema = data[0].close;
    data.forEach((d, i) => {
        ema = (d.close * k) + (ema * (1-k));
        if (i >= p) emaArr.push({ time: d.time, value: ema });
    });
    return emaArr;
}

function calculateRSI(data, p) {
    let rsiArr = [];
    if (data.length <= p) return rsiArr;
    let g = 0, l = 0;
    for (let i=1; i<=p; i++) {
        let diff = data[i].close - data[i-1].close;
        diff >= 0 ? g += diff : l -= diff;
    }
    let avgG = g/p, avgL = l/p;
    for (let i=p+1; i<data.length; i++) {
        let diff = data[i].close - data[i-1].close;
        avgG = (avgG*(p-1) + (diff>0?diff:0))/p;
        avgL = (avgL*(p-1) + (diff<0?-diff:0))/p;
        rsiArr.push({ time: data[i].time, value: 100 - (100/(1 + avgG/avgL)) });
    }
    return rsiArr;
}

function updateSignal(f, s, r) {
    const banner = document.getElementById('status-banner');
    const txt = document.getElementById('signal-text');
    const lF = f[f.length-1].value, lS = s[s.length-1].value;

    if (lF > lS && r < 70) { banner.className = 'buy'; txt.innerText = `🟢 COMPRA: ${currentAssetKey}`; }
    else if (lF < lS && r > 30) { banner.className = 'sell'; txt.innerText = `🔴 VENTA: ${currentAssetKey}`; }
    else { banner.className = 'neutral'; txt.innerText = `⚪ NEUTRAL: ${currentAssetKey}`; }
}

// --- EVENTOS Y DIAGNÓSTICO ---
document.getElementById('asset-selector').addEventListener('change', (e) => {
    currentAssetKey = e.target.value;
    fetchMarketData();
});

function ejecutarDiagnostico() {
    let msg = (typeof LightweightCharts !== 'undefined') ? "✅ Motor OK" : "❌ Error de Motor";
    msg += (document.querySelector('.main-logo').naturalWidth > 0) ? "\n✅ Logo OK" : "\n⚠️ Logo no encontrado";
    alert("DIAGNÓSTICO ALHADIQA:\n" + msg);
}
// --- MOTOR SMC (Smart Money Concepts) ---
function detectarEstructuraSMC(candles) {
    if (candles.length < 10) return null;

    let altos = [], bajos = [];
    
    // Detectar Fractales (Máximos y Mínimos locales)
    for (let i = 2; i < candles.length - 2; i++) {
        // Swing High (Alto)
        if (candles[i].high > candles[i-1].high && candles[i].high > candles[i-2].high &&
            candles[i].high > candles[i+1].high && candles[i].high > candles[i+2].high) {
            altos.push({ index: i, value: candles[i].high, time: candles[i].time });
        }
        // Swing Low (Bajo)
        if (candles[i].low < candles[i-1].low && candles[i].low < candles[i-2].low &&
            candles[i].low < candles[i+1].low && candles[i].low < candles[i+2].low) {
            bajos.push({ index: i, value: candles[i].low, time: candles[i].time });
        }
    }

    // Lógica de Break of Structure (BOS)
    const precioActual = candles[candles.length - 1].close;
    const ultimoAlto = altos[altos.length - 1]?.value;
    const ultimoBajo = bajos[bajos.length - 1]?.value;

    if (precioActual > ultimoAlto) return "BOS ALCISTA (Quiebre al alza)";
    if (precioActual < ultimoBajo) return "BOS BAJISTA (Quiebre a la baja)";
    
    return "Estructura en Desarrollo";
}
