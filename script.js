// --- AL-HADIQA TERMINAL CORE ENGINE v3.5 ---

(function checkLibrary() {
    if (typeof LightweightCharts === 'undefined') {
        const backupScript = document.createElement('script');
        backupScript.src = "https://unpkg.com/lightweight-charts@4.1.1/dist/lightweight-charts.standalone.production.js";
        backupScript.onload = () => { initTerminal(); };
        document.head.appendChild(backupScript);
    } else {
        if (document.readyState === 'complete') initTerminal();
        else window.onload = initTerminal;
    }
})();

// --- CONFIGURACIÓN GLOBAL ---
let CONFIG = { 
    ema_20: 20, ema_50: 50, ema_80: 80, sma_100: 100, rsi_period: 14,
    risk_percent: 0.01 
};

let GLOBAL = {
    asset: 'BTC', tf: '15m',
    socket: null, velas: [],
    symbol_map: { 'BTC': 'btcusdt', 'ETH': 'ethusdt', 'EURUSD': 'eurusdt', 'GBPUSD': 'gbpusdt' }
};

let chart, candleSeries, ema20Series, ema50Series, ema80Series, sma100Series;

// --- 1. MOTOR GRÁFICO (REDISEÑO STEALTH) ---
function initTerminal() {
    const chartElement = document.getElementById('main-chart');
    if (!chartElement) return;

    chart = LightweightCharts.createChart(chartElement, {
        width: chartElement.clientWidth,
        height: chartElement.clientHeight,
        layout: { 
            background: { type: 'solid', color: '#000000' }, 
            textColor: '#7982a9', 
            fontSize: 11,
            fontFamily: 'JetBrains Mono, monospace'
        },
        grid: { 
            vertLines: { color: '#0a0c12' }, 
            horzLines: { color: '#0a0c12' } 
        },
        timeScale: { timeVisible: true, borderColor: '#1f2335', barSpacing: 8 },
        crosshair: { mode: 0, vertLine: { color: '#1fd1ed', labelBackgroundColor: '#1fd1ed' }, horzLine: { color: '#1fd1ed', labelBackgroundColor: '#1fd1ed' } },
        handleScroll: true, handleScale: true
    });

    // Series con estética Kali
    candleSeries = chart.addCandlestickSeries({ upColor: '#00ff9d', downColor: '#ff4a4a', borderVisible: false, wickUpColor: '#00ff9d', wickDownColor: '#ff4a4a' });
    ema20Series = chart.addLineSeries({ color: '#1fd1ed', lineWidth: 1, priceLineVisible: false });
    ema50Series = chart.addLineSeries({ color: '#9c27b0', lineWidth: 1, priceLineVisible: false });
    sma100Series = chart.addLineSeries({ color: '#f44336', lineWidth: 1.5, priceLineVisible: false });

    setupEventListeners();
    cargarActivo();

    const resizeObserver = new ResizeObserver(() => {
        chart.applyOptions({ width: chartElement.clientWidth, height: chartElement.clientHeight });
    });
    resizeObserver.observe(chartElement);
}

// --- 2. GESTIÓN DE FLUJO DE DATOS ---
async function cargarActivo() {
    const selector = document.getElementById('asset-selector');
    if(!selector) return;

    GLOBAL.asset = selector.value;
    document.getElementById('asset-name').innerText = selector.options[selector.selectedIndex].text;
    
    // Limpieza de socket previo
    if (GLOBAL.socket) {
        GLOBAL.socket.onmessage = null;
        GLOBAL.socket.close();
    }
    
    document.getElementById('kira-action').innerText = "> UPDATING_STREAM...";
    await fetchHistoricalData();
    iniciarBinanceSocket();
}

// Función para cambiar Temporalidad
window.cambiarTF = function(newTf) {
    GLOBAL.tf = newTf;
    // Actualizar UI de botones
    document.querySelectorAll('.tf-btn').forEach(btn => {
        btn.classList.toggle('active', btn.innerText.toLowerCase() === newTf);
    });
    cargarActivo();
}

async function fetchHistoricalData() {
    try {
        const symbol = GLOBAL.symbol_map[GLOBAL.asset].toUpperCase();
        const res = await fetch(`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${GLOBAL.tf}&limit=500`);
        const data = await res.json();
        
        GLOBAL.velas = data.map(d => ({
            time: d[0] / 1000,
            open: parseFloat(d[1]), high: parseFloat(d[2]),
            low: parseFloat(d[3]), close: parseFloat(d[4])
        }));

        candleSeries.setData(GLOBAL.velas);
        actualizarIndicadores(GLOBAL.velas);
    } catch (e) { console.error("ERR_DATA_FETCH:", e); }
}

function iniciarBinanceSocket() {
    const symbol = GLOBAL.symbol_map[GLOBAL.asset];
    GLOBAL.socket = new WebSocket(`wss://stream.binance.com:9443/ws/${symbol}@kline_${GLOBAL.tf}`);
    
    GLOBAL.socket.onmessage = (msg) => {
        const k = JSON.parse(msg.data).k;
        const candle = {
            time: k.t / 1000,
            open: parseFloat(k.o), high: parseFloat(k.h),
            low: parseFloat(k.l), close: parseFloat(k.c)
        };

        candleSeries.update(candle);
        
        // Formateo dinámico de precio
        const priceStr = candle.close.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 5 });
        document.getElementById('current-price').innerText = `$${priceStr}`;

        if (k.x) { // Cierre de vela
            GLOBAL.velas.push(candle);
            if (GLOBAL.velas.length > 1000) GLOBAL.velas.shift();
            actualizarIndicadores(GLOBAL.velas);
        }
    };
}

// --- 3. ANALÍTICA Y SEÑALES ---
function actualizarIndicadores(candles) {
    if (candles.length < 100) return;

    ema20Series.setData(calculateEMA(candles, CONFIG.ema_20));
    ema50Series.setData(calculateEMA(candles, CONFIG.ema_50));
    sma100Series.setData(calculateSMA(candles, CONFIG.sma_100));
    
    const rsi = calculateRSI(candles, CONFIG.rsi_period);
    const lastRSI = rsi[rsi.length - 1].value;
    
    document.getElementById('rsi-value').innerText = lastRSI.toFixed(2);
    document.getElementById('rsi-fill').style.width = `${lastRSI}%`;
    
    // Feedback de color RSI
    const rsiFill = document.getElementById('rsi-fill');
    if(lastRSI > 70) rsiFill.style.background = 'var(--danger)';
    else if(lastRSI < 30) rsiFill.style.background = 'var(--success)';
    else rsiFill.style.background = 'var(--accent)';

    ejecutarLogicaKira(lastRSI);
}

function ejecutarLogicaKira(rsi) {
    const box = document.getElementById('kira-signal-box');
    const action = document.getElementById('kira-action');

    if (rsi > 70) {
        box.style.borderLeft = "4px solid var(--danger)";
        action.innerText = "> SELL_CONFIRMED";
        action.style.color = "var(--danger)";
    } else if (rsi < 30) {
        box.style.borderLeft = "4px solid var(--success)";
        action.innerText = "> BUY_CONFIRMED";
        action.style.color = "var(--success)";
    } else {
        box.style.borderLeft = "4px solid var(--text-dim)";
        action.innerText = "> NEUTRAL_ZONE";
        action.style.color = "var(--text-dim)";
    }
}

// --- 4. MATH UTILS ---
function calculateEMA(data, p) {
    let k = 2 / (p + 1), emaArr = [], ema = data[0].close;
    data.forEach((d, i) => {
        ema = (d.close * k) + (ema * (1 - k));
        if (i >= p) emaArr.push({ time: d.time, value: ema });
    });
    return emaArr;
}

function calculateSMA(data, p) {
    let smaArr = [];
    for (let i = p; i < data.length; i++) {
        let sum = data.slice(i - p, i).reduce((a, b) => a + b.close, 0);
        smaArr.push({ time: data[i].time, value: sum / p });
    }
    return smaArr;
}

function calculateRSI(data, p) {
    let rsiArr = [], gains = 0, losses = 0;
    for (let i = 1; i <= p; i++) {
        let diff = data[i].close - data[i - 1].close;
        if (diff >= 0) gains += diff; else losses -= diff;
    }
    let avgG = gains / p, avgL = losses / p;
    for (let i = p + 1; i < data.length; i++) {
        let diff = data[i].close - data[i - 1].close;
        avgG = (avgG * (p - 1) + (diff > 0 ? diff : 0)) / p;
        avgL = (avgL * (p - 1) + (diff < 0 ? -diff : 0)) / p;
        rsiArr.push({ time: data[i].time, value: 100 - (100 / (1 + avgG / avgL)) });
    }
    return rsiArr;
}

// --- 5. TOOLS & PAYMENTS ---
function calcularLotaje() {
    const balance = document.getElementById('kira-balance').value;
    const lotaje = (balance * 0.00001).toFixed(2);
    document.getElementById('suggested-lot').innerText = lotaje > 0.01 ? lotaje : "0.01";
}

const KIRA_PAY = {
    wallet: "0x3D88C06C786a3449377708705F6fE6306c368686",
    abrir() {
        document.getElementById('crypto-modal').style.display = 'flex';
        document.getElementById('qr-deposit').src = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${this.wallet}`;
        document.getElementById('wallet-addr').innerText = this.wallet;
    }
};

function setupEventListeners() {
    window.KIRA_PAY = KIRA_PAY;
    calcularLotaje();
}

async function conectarMetaMask() {
    if (window.ethereum) {
        try {
            const accounts = await ethereum.request({ method: 'eth_requestAccounts' });
            alert("LINK_SUCCESS: " + accounts[0].substring(0, 10) + "...");
        } catch (e) { alert("LINK_REJECTED"); }
    } else { alert("METAMASK_NOT_FOUND"); }
    }
// --- KIRA SMC MODULE: ORDER BLOCKS ---
let orderBlocks = [];

function detectarOrderBlocks(candles) {
    // Limpiar bloques antiguos para no saturar la gráfica
    orderBlocks.forEach(obj => chart.removeVertLine(obj)); // Simplificado para el ejemplo

    for (let i = candles.length - 20; i < candles.length - 1; i++) {
        const current = candles[i];
        const next = candles[i + 1];

        // Lógica de Order Block Bajista (Vela alcista antes de caída fuerte)
        if (current.close > current.open && (next.open - next.close) > (current.high - current.low) * 2) {
            marcarZona(current.high, current.low, 'bearish');
        }
        
        // Lógica de Order Block Alcista (Vela bajista antes de subida fuerte)
        if (current.close < current.open && (next.close - next.open) > (current.high - current.low) * 2) {
            marcarZona(current.high, current.low, 'bullish');
        }
    }
}

function marcarZona(top, bottom, type) {
    const color = type === 'bullish' ? 'rgba(0, 255, 157, 0.2)' : 'rgba(255, 74, 74, 0.2)';
    const lineId = candleSeries.createPriceLine({
        price: (top + bottom) / 2,
        color: type === 'bullish' ? '#00ff9d' : '#ff4a4a',
        lineWidth: 2,
        lineStyle: 2, // Dash line
        axisLabelVisible: true,
        title: type.toUpperCase() + ' OB',
    });
}
