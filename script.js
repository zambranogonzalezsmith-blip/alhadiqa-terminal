/* --- ALHADIQA CORE ENGINE v6.0 --- */

let tvWidget;

// 1. INICIALIZACIÓN DEL WIDGET PROFESIONAL
function initTradingView() {
    tvWidget = new TradingView.widget({
        "autosize": true,
        "symbol": "BINANCE:BTCUSDT",
        "interval": "15",
        "timezone": "Etc/UTC",
        "theme": "dark",
        "style": "1",
        "locale": "es",
        "toolbar_bg": "#050608",
        "enable_publishing": false,
        "withdateranges": true,
        "hide_side_toolbar": false,
        "allow_symbol_change": true,
        "details": true,
        "hotlist": true,
        "calendar": true,
        "container_id": "tv_chart_container",
        // INYECCIÓN DE INDICADORES INSTITUCIONALES
        "studies": [
            {
                "id": "MAExp@tv-basicstudies",
                "version": 1,
                "inputs": { "length": 20 }
            },
            {
                "id": "MAExp@tv-basicstudies",
                "version": 1,
                "inputs": { "length": 50 }
            },
            {
                "id": "MAExp@tv-basicstudies",
                "version": 1,
                "inputs": { "length": 80 }
            },
            {
                "id": "MASimple@tv-basicstudies",
                "version": 1,
                "inputs": { "length": 100 }
            },
            "RSI@tv-basicstudies",
            "MACD@tv-basicstudies"
        ],
        "overrides": {
            "mainSeriesProperties.candleStyle.upColor": "#00ff9d",
            "mainSeriesProperties.candleStyle.downColor": "#ff4a4a",
            "mainSeriesProperties.candleStyle.wickUpColor": "#00ff9d",
            "mainSeriesProperties.candleStyle.wickDownColor": "#ff4a4a",
            "paneProperties.background": "#020408",
            "paneProperties.vertGridProperties.color": "rgba(31, 209, 237, 0.05)",
            "paneProperties.horzGridProperties.color": "rgba(31, 209, 237, 0.05)"
        }
    });
}

// 2. KIRA SMC ALGORITHM: CÁLCULO DE ENTRADAS
// Esta función simula la lectura de liquidez y proyecta SL/TP institucionales
function ejecutarKiraSMC() {
    const statusLabel = document.getElementById('status');
    const badge = document.getElementById('signal-type');
    
    // Simulación de detección de Order Block
    statusLabel.innerText = "BUSCANDO_LIQUIDIDAD_SMC...";
    statusLabel.style.color = "var(--gold)";

    setTimeout(() => {
        // Lógica de cálculo 1:3 Riesgo Beneficio
        // En producción, esto vendría de un fetch a tu API de señales
        const precioActual = 65200; // Ejemplo
        const esCompra = Math.random() > 0.5;
        
        const entry = precioActual;
        const sl = esCompra ? entry * 0.992 : entry * 1.008; // 0.8% SL
        const tp = esCompra ? entry * 1.024 : entry * 0.976; // 2.4% TP (1:3 Ratio)

        // Actualizar HUD
        badge.className = `signal-badge ${esCompra ? 'buy' : 'sell'}`;
        badge.innerText = esCompra ? "INSTITUTIONAL_BUY_ZONE" : "INSTITUTIONAL_SELL_ZONE";
        
        document.getElementById('entry-p').innerText = `$${entry.toLocaleString()}`;
        document.getElementById('sl-p').innerText = `$${sl.toLocaleString()}`;
        document.getElementById('tp-p').innerText = `$${tp.toLocaleString()}`;
        
        statusLabel.innerText = "SEÑAL_CONFIRMADA";
        statusLabel.style.color = "var(--success)";
    }, 2000);
}

// 3. UTILIDADES DE SISTEMA
function updateClock() {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-GB', { timeZone: 'UTC' });
    document.getElementById('clock').innerText = `${timeStr} UTC`;
}

// 4. CAMBIO DINÁMICO DE ACTIVOS
function changeAsset(symbol) {
    if (tvWidget) {
        tvWidget.chart().setSymbol(`BINANCE:${symbol}USDT`);
        document.getElementById('asset-label').innerText = `${symbol}/USDT`;
        ejecutarKiraSMC(); // Recalcular al cambiar
    }
}

// ARRANQUE DEL SISTEMA
window.onload = () => {
    initTradingView();
    setInterval(updateClock, 1000);
    setInterval(ejecutarKiraSMC, 30000); // Escaneo cada 30 segundos
    ejecutarKiraSMC(); 
    
};
/* --- NUCLEUS ALGORITHM SMC v1.0 --- */

let widget;
let trades = [];

// 1. INICIAR TRADINGVIEW
function initChart() {
    widget = new TradingView.widget({
        "autosize": true,
        "symbol": "BINANCE:BTCUSDT",
        "interval": "15",
        "timezone": "Etc/UTC",
        "theme": "dark",
        "container_id": "tv_chart_main",
        "library_path": "https://s3.tradingview.com/",
        "enable_publishing": false,
        "hide_side_toolbar": false,
        "details": true,
        "studies": [
            "RSI@tv-basicstudies",
            "MAExp@tv-basicstudies"
        ]
    });
}

// 2. DETECTOR DE SESIONES HORARIAS
function updateSession() {
    const hour = new Date().getUTCHours();
    const tag = document.getElementById('session-tag');
    
    if (hour >= 8 && hour < 12) tag.innerText = "SESSION: NEW YORK (HIGH VOLATILITY)";
    else if (hour >= 0 && hour < 8) tag.innerText = "SESSION: LONDON (TRENDING)";
    else if (hour >= 13 && hour < 21) tag.innerText = "SESSION: TOKYO (RANGE)";
    else tag.innerText = "SESSION: ASIAN KILLZONE";
}

// 3. ALGORITMO KIRA SMC (MOTOR DE ENTRADAS)
function runSMCAlgorithm() {
    // Simulamos detección de choque de liquidez y order block
    const isBullish = Math.random() > 0.5;
    const price = 65000 + (Math.random() * 500);
    
    // Proyectar Niveles (Estructura 1:3 RR)
    const slDist = price * 0.005; // 0.5% SL
    const tpDist = slDist * 3;     // 1.5% TP

    const signal = {
        type: isBullish ? 'INSTITUTIONAL_BUY' : 'INSTITUTIONAL_SELL',
        entry: price.toFixed(2),
        sl: isBullish ? (price - slDist).toFixed(2) : (price + slDist).toFixed(2),
        tp: isBullish ? (price + tpDist).toFixed(2) : (price - tpDist).toFixed(2)
    };

    updateHUD(signal);
    executeDemoTrade(signal);
}

function updateHUD(s) {
    const type = document.getElementById('signal-type');
    type.innerText = s.type;
    type.className = s.type.includes('BUY') ? 'val' : 'danger';
    
    document.getElementById('entry-val').innerText = `$${s.entry}`;
    document.getElementById('sl-val').innerText = `$${s.sl}`;
    document.getElementById('tp-val').innerText = `$${s.tp}`;
}

// 4. EMULADOR DEMO REAL-TIME
function executeDemoTrade(s) {
    const tradeLog = document.getElementById('active-trades');
    const tradeHtml = `
        <div class="stat-item" style="border-bottom: 1px solid #1a1e2e; padding-bottom: 5px;">
            <small>${s.type}</small>
            <span class="val">${s.entry}</span>
        </div>
    `;
    tradeLog.innerHTML = tradeHtml + tradeLog.innerHTML;
    
    // Simulación de P/L
    setInterval(() => {
        const pl = (Math.random() * 100 - 40).toFixed(2);
        const el = document.getElementById('live-pl');
        el.innerText = `${pl > 0 ? '+' : ''}$${pl}`;
        el.style.color = pl > 0 ? 'var(--success)' : 'var(--danger)';
    }, 2000);
}

// ARRANQUE
window.onload = () => {
    initChart();
    updateSession();
    setInterval(updateSession, 60000);
    setTimeout(runSMCAlgorithm, 3000); // Primera señal a los 3 seg
    setInterval(runSMCAlgorithm, 30000); // Escaneo cada 30 seg
};
