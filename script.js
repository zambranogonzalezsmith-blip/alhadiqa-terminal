// --- SISTEMA DE AUTO-RECUPERACIÓN DE LIBRERÍA ---
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

// --- CONFIGURACIÓN GLOBAL KIRA 1.0 ---
let CONFIG = { 
    ema_20: 20, ema_50: 50, ema_80: 80, sma_100: 100, rsi_period: 14,
    risk_percent: 0.01 
};

let GLOBAL = {
    asset: 'BTC', type: 'crypto', tf: '15m',
    socket: null, velas: [],
    symbol_map: { 'BTC': 'btcusdt', 'ETH': 'ethusdt', 'EURUSD': 'eurusdt', 'GBPUSD': 'gbpusdt' }
};

let chart, candleSeries, ema20Series, ema50Series, ema80Series, sma100Series;

// --- 1. MOTOR GRÁFICO (KALI & INSTITUTIONAL STYLE) ---
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
            vertLines: { color: '#0f111a' }, 
            horzLines: { color: '#0f111a' } 
        },
        timeScale: { timeVisible: true, borderColor: '#1f2335' },
        crosshair: { mode: 0, vertLine: { color: '#1fd1ed' }, horzLine: { color: '#1fd1ed' } }
    });

    // Series con colores Kali
    candleSeries = chart.addCandlestickSeries({ upColor: '#00ff9d', downColor: '#ff4a4a', borderVisible: false, wickUpColor: '#00ff9d', wickDownColor: '#ff4a4a' });
    ema20Series = chart.addLineSeries({ color: '#1fd1ed', lineWidth: 1, title: 'EMA 20' });
    ema50Series = chart.addLineSeries({ color: '#9c27b0', lineWidth: 1, title: 'EMA 50' });
    ema80Series = chart.addLineSeries({ color: '#d29922', lineWidth: 1, title: 'EMA 80' });
    sma100Series = chart.addLineSeries({ color: '#f44336', lineWidth: 2, title: 'SMA 100' });

    setupEventListeners();
    cargarActivo();

    const resizeObserver = new ResizeObserver(() => {
        chart.applyOptions({ width: chartElement.clientWidth, height: chartElement.clientHeight });
    });
    resizeObserver.observe(chartElement);
}

// --- 2. GESTIÓN DE DATOS ---
async function cargarActivo() {
    const selector = document.getElementById('asset-selector');
    if(!selector) return;

    GLOBAL.asset = selector.value;
    document.getElementById('asset-name').innerText = selector.options[selector.selectedIndex].text;
    
    if (GLOBAL.socket) GLOBAL.socket.close();
    
    document.getElementById('kira-action').innerText = "> FETCHING_MARKET_DATA...";
    await fetchHistoricalData();
    iniciarBinanceSocket();
}

async function fetchHistoricalData() {
    try {
        const symbol = GLOBAL.symbol_map[GLOBAL.asset].toUpperCase();
        const res = await fetch(`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${GLOBAL.tf}&limit=300`);
        const data = await res.json();
        
        GLOBAL.velas = data.map(d => ({
            time: d[0] / 1000,
            open: parseFloat(d[1]), high: parseFloat(d[2]),
            low: parseFloat(d[3]), close: parseFloat(d[4])
        }));

        candleSeries.setData(GLOBAL.velas);
        actualizarIndicadores(GLOBAL.velas);
    } catch (e) { console.error("Error historial:", e); }
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
        const priceStr = candle.close > 1 ? candle.close.toFixed(2) : candle.close.toFixed(5);
        document.getElementById('current-price').innerText = `$${priceStr}`;

        if (k.x) {
            GLOBAL.velas.push(candle);
            if (GLOBAL.velas.length > 500) GLOBAL.velas.shift();
            actualizarIndicadores(GLOBAL.velas);
        }
    };
}

// --- 3. MOTOR ANALÍTICO KIRA ---
function actualizarIndicadores(candles) {
    if (candles.length < 100) return;

    const e20 = calculateEMA(candles, CONFIG.ema_20);
    const e50 = calculateEMA(candles, CONFIG.ema_50);
    const e80 = calculateEMA(candles, CONFIG.ema_80);
    const s100 = calculateSMA(candles, CONFIG.sma_100);
    const rsi = calculateRSI(candles, CONFIG.rsi_period);

    ema20Series.setData(e20);
    ema50Series.setData(e50);
    ema80Series.setData(e80);
    sma100Series.setData(s100);

    // Actualizar UI RSI
    const lastRSI = rsi[rsi.length - 1].value;
    document.getElementById('rsi-value').innerText = lastRSI.toFixed(2);
    document.getElementById('rsi-fill').style.width = `${lastRSI}%`;

    ejecutarLogicaKira(candles[candles.length - 1].close, lastRSI);
}

function ejecutarLogicaKira(precio, rsi) {
    const box = document.getElementById('kira-signal-box');
    const action = document.getElementById('kira-action');

    if (rsi > 70) {
        box.className = "kira-sell";
        action.innerText = "> OVERBOUGHT_DANGER / SELL";
    } else if (rsi < 30) {
        box.className = "kira-buy";
        action.innerText = "> OVERSOLD_CONFIRMED / BUY";
    } else {
        box.className = "kira-wait";
        action.innerText = "> SCANNING_LIQUIDITY...";
    }
}

// --- 4. CÁLCULOS TÉCNICOS ---
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
    let rsiArr = [];
    let gains = 0, losses = 0;
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

// --- 5. UTILIDADES INSTITUCIONALES ---
function calcularLotaje() {
    const balance = document.getElementById('kira-balance').value;
    const lotaje = (balance * 0.00001).toFixed(2); // Ejemplo de gestión de riesgo 1:100
    document.getElementById('suggested-lot').innerText = lotaje > 0.01 ? lotaje : "0.01";
}

const KIRA_PAY = {
    wallet: "0x3D88C06C786a3449377708705F6fE6306c368686", // Wallet BEP20 AL-HADIQA
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
            alert("VINCULACIÓN_EXITOSA: " + accounts[0].substring(0, 10) + "...");
        } catch (e) { console.error("User rejected"); }
    } else {
        alert("METAMASK_NOT_FOUND");
    }
                                 }
