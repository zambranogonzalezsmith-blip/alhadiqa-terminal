// --- SISTEMA DE AUTO-RECUPERACIÓN ALHADIQA ---
(function checkLibrary() {
    if (typeof LightweightCharts === 'undefined') {
        const backupScript = document.createElement('script');
        backupScript.src = "https://unpkg.com/lightweight-charts@4.1.1/dist/lightweight-charts.standalone.production.js";
        backupScript.onload = () => { initTerminal(); };
        document.head.appendChild(backupScript);
    } else {
        window.onload = initTerminal;
    }
})();

// --- CONFIGURACIÓN Y ESTADOS ---
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
let terminalMode = 'normal'; // 'normal' o 'smc'
let chart, candleSeries, emaFastSeries, emaSlowSeries;

// --- INICIALIZACIÓN ---
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

    // Escuchador para el botón del menú
    document.getElementById('nav-forex-smc')?.addEventListener('click', (e) => {
        e.preventDefault();
        activarModoSMC();
    });

    fetchMarketData();
    setInterval(fetchMarketData, CONFIG.update_ms);
}

// --- CAMBIO DE MODO DINÁMICO ---
function activarModoSMC() {
    terminalMode = 'smc';
    document.querySelectorAll('.nav-links li').forEach(li => li.classList.remove('active'));
    document.getElementById('nav-forex-smc').parentElement.classList.add('active');
    
    // UI Changes
    document.getElementById('smc-info-card').style.display = 'block';
    emaFastSeries.applyOptions({ visible: false });
    emaSlowSeries.applyOptions({ visible: false });
    
    alert("SISTEMA ALHADIQA: Modo SMC Pro Activado. Analizando huella institucional...");
    fetchMarketData();
}

// --- GESTOR DE DATOS ---
async function fetchMarketData() {
    const asset = ASSETS[currentAssetKey];
    document.getElementById('asset-name').innerText = asset.name;

    try {
        let candles = (asset.type === 'crypto') ? await getCryptoData(asset.id) : await getYahooData(asset.symbol);
        if (!candles || candles.length < 2) return;

        candleSeries.setData(candles);
        
        const rsiV = calculateRSI(candles, CONFIG.rsi_period);
        const lastRSI = rsiV.length > 0 ? rsiV[rsiV.length - 1].value : 50;
        const lastPrice = candles[candles.length - 1].close;

        document.getElementById('current-price').innerText = `$${lastPrice.toLocaleString()}`;
        document.getElementById('rsi-value').innerText = lastRSI.toFixed(2);

        if (terminalMode === 'normal') {
            const emaF = calculateEMA(candles, CONFIG.ema_fast);
            const emaS = calculateEMA(candles, CONFIG.ema_slow);
            emaFastSeries.setData(emaF);
            emaSlowSeries.setData(emaS);
            updateSignal(emaF, emaS, lastRSI);
        } else {
            const estructura = detectarEstructuraSMC(candles);
            document.getElementById('smc-status').innerText = estructura;
            document.getElementById('signal-text').innerText = `MODO SMC: ${estructura}`;
        }
    } catch (e) { console.error("Error de red"); }
}

// --- MOTOR SMC (Lógica de LuxAlgo base) ---
function detectarEstructuraSMC(candles) {
    if (candles.length < 20) return "Cargando Historial...";
    
    let altos = [], bajos = [];
    for (let i = 2; i < candles.length - 2; i++) {
        if (candles[i].high > candles[i-1].high && candles[i].high > candles[i+1].high) altos.push(candles[i].high);
        if (candles[i].low < candles[i-1].low && candles[i].low < candles[i+1].low) bajos.push(candles[i].low);
    }

    const current = candles[candles.length - 1].close;
    const lastHigh = altos[altos.length - 1];
    const lastLow = bajos[bajos.length - 1];

    if (current > lastHigh) return "BOS ALCISTA 🚀";
    if (current < lastLow) return "BOS BAJISTA 📉";
    return "Consolidación (IDM)";
}

// --- CONECTORES ---
async function getCryptoData(id) {
    const r = await fetch(`https://api.coingecko.com/api/v3/coins/${id}/ohlc?vs_currency=usd&days=1`);
    return (await r.json()).map(d => ({ time: d[0]/1000, open: d[1], high: d[2], low: d[3], close: d[4] }));
}

async function getYahooData(s) {
    const u = `https://query1.finance.yahoo.com/v8/finance/chart/${s}?interval=15m&range=2d`;
    const r = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`);
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
    let rsiArr = []; if (data.length <= p) return rsiArr;
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

function ejecutarDiagnostico() {
    let msg = (typeof LightweightCharts !== 'undefined') ? "✅ Motor OK" : "❌ Error de Motor";
    alert("DIAGNÓSTICO ALHADIQA:\n" + msg);
}

document.getElementById('asset-selector').addEventListener('change', (e) => {
    currentAssetKey = e.target.value;
    fetchMarketData();
});
let currentTimeframe = '15m'; // Default

function cambiarTF(tf) {
    currentTimeframe = tf;
    
    // Actualizar apariencia de botones
    document.querySelectorAll('.tf-btn').forEach(btn => {
        btn.classList.remove('active');
        if(btn.innerText === tf.toUpperCase()) btn.classList.add('active');
    });

    console.log(`⏱️ Cambiando temporalidad a: ${tf}`);
    
    // Forzar recarga de datos
    fetchMarketData();
}

// Modificación necesaria en tu función getYahooData:
// Asegúrate de que la URL use la variable: ...interval=${currentTimeframe}...
