// --- SISTEMA DE AUTO-RECUPERACIÓN ---
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

// --- CONFIGURACIÓN GLOBAL ---
let CONFIG = { ema_fast: 9, ema_slow: 21, rsi_period: 14 };
let GLOBAL = {
    asset: 'BTC',
    type: 'crypto', // 'crypto' o 'forex'
    tf: '1m',       // Temporalidad por defecto para binarias
    socket: null,   // Variable para el túnel WebSocket
    interval: null, // Variable para el intervalo Forex
    symbol_map: {   // Mapeo para Binance
        'BTC': 'btcusdt',
        'ETH': 'ethusdt'
    }
};

let chart, candleSeries, emaFastSeries, emaSlowSeries;

// --- 1. INICIALIZACIÓN DEL MOTOR GRÁFICO ---
function initTerminal() {
    const chartElement = document.getElementById('main-chart');
    if (!chartElement) return;

    // Configuración estilo TradingView
    chart = LightweightCharts.createChart(chartElement, {
        width: chartElement.offsetWidth,
        height: chartElement.offsetHeight,
        layout: { background: { type: 'solid', color: '#010409' }, textColor: '#d1d4dc', fontSize: 12 },
        grid: { vertLines: { color: '#161b22' }, horzLines: { color: '#161b22' } },
        crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
        // Movimiento fluido activado
        handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: true },
        handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true },
        timeScale: { timeVisible: true, borderColor: '#30363d', rightOffset: 5, barSpacing: 10 },
    });

    // Series de datos
    candleSeries = chart.addCandlestickSeries({
        upColor: '#089981', downColor: '#f23645', // Colores TradingView modernos
        borderVisible: false, wickUpColor: '#089981', wickDownColor: '#f23645',
    });

    emaFastSeries = chart.addLineSeries({ color: '#2962ff', lineWidth: 2 });
    emaSlowSeries = chart.addLineSeries({ color: '#ff9800', lineWidth: 2 });

    // Listeners de UI
    setupEventListeners();
    
    // Carga inicial
    cargarActivo();
    
    // Auto-ajuste de tamaño
    window.addEventListener('resize', () => {
        chart.applyOptions({ width: chartElement.offsetWidth, height: chartElement.offsetHeight });
    });
}

// --- 2. GESTOR DE CONEXIONES (EL CEREBRO) ---
async function cargarActivo() {
    // Definimos el activo actual
    const selector = document.getElementById('asset-selector');
    const selectedOption = selector.options[selector.selectedIndex];
    
    GLOBAL.asset = selector.value;
    GLOBAL.type = selectedOption.parentElement.label === 'Criptomonedas' ? 'crypto' : 'forex';
    
    document.getElementById('asset-name').innerText = selectedOption.text;
    document.getElementById('signal-text').innerText = "CONECTANDO DATOS...";

    // 1. Limpiamos conexiones viejas
    if (GLOBAL.socket) { GLOBAL.socket.close(); GLOBAL.socket = null; }
    if (GLOBAL.interval) { clearInterval(GLOBAL.interval); GLOBAL.interval = null; }

    // 2. Cargamos historial (Velas pasadas)
    await fetchHistoricalData();

    // 3. Iniciamos el Stream en Vivo
    if (GLOBAL.type === 'crypto') {
        iniciarBinanceSocket(); // WebSocket Real
    } else {
        iniciarForexPolling();  // Polling Rápido
    }
}

// --- 3. DATOS HISTÓRICOS (API REST) ---
async function fetchHistoricalData() {
    let candles = [];
    try {
        if (GLOBAL.type === 'crypto') {
            // Historial de Binance API
            const symbol = GLOBAL.symbol_map[GLOBAL.asset].toUpperCase();
            const res = await fetch(`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${GLOBAL.tf}&limit=500`);
            const data = await res.json();
            candles = data.map(d => ({
                time: d[0] / 1000, open: parseFloat(d[1]), high: parseFloat(d[2]),
                low: parseFloat(d[3]), close: parseFloat(d[4])
            }));
        } else {
            // Historial de Yahoo Finance
            const res = await getYahooData(GLOBAL.asset);
            candles = res;
        }

        if (candles.length > 0) {
            candleSeries.setData(candles);
            // Calculamos indicadores iniciales
            actualizarIndicadores(candles);
        }
    } catch (e) {
        console.error("Error historial:", e);
    }
}

// --- 4. WEBSOCKET REAL (CRIPTO) ---
function iniciarBinanceSocket() {
    const symbol = GLOBAL.symbol_map[GLOBAL.asset];
    const wsUrl = `wss://stream.binance.com:9443/ws/${symbol}@kline_${GLOBAL.tf}`;
    
    console.log(`🔌 Conectando socket a: ${symbol} (${GLOBAL.tf})`);
    
    GLOBAL.socket = new WebSocket(wsUrl);

    GLOBAL.socket.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        const k = msg.k;

        const candle = {
            time: k.t / 1000,
            open: parseFloat(k.o),
            high: parseFloat(k.h),
            low: parseFloat(k.l),
            close: parseFloat(k.c)
        };

        // .update() crea la magia del movimiento fluido
        candleSeries.update(candle);
        
        // Actualizamos UI
        document.getElementById('current-price').innerText = `$${candle.close.toFixed(2)}`;
        
        // Si la vela cerró, recalculamos indicadores
        if (k.x) { 
            // Aquí podríamos llamar a actualizarIndicadores de nuevo
        }
    };
}

// --- 5. FOREX POLLING RÁPIDO (SIMULACIÓN STREAM) ---
function iniciarForexPolling() {
    console.log("📡 Iniciando conexión rápida Forex...");
    
    // Función de actualización rápida
    const updateForex = async () => {
        const candles = await getYahooData(GLOBAL.asset);
        if (candles && candles.length > 0) {
            const lastCandle = candles[candles.length - 1];
            candleSeries.update(lastCandle); // Actualiza la última vela
            document.getElementById('current-price').innerText = `$${lastCandle.close.toFixed(2)}`;
            actualizarIndicadores(candles); // Recalcula indicadores
        }
    };

    // Ejecutar cada 3 segundos (3000ms)
    GLOBAL.interval = setInterval(updateForex, 3000);
}

// --- UTILIDADES Y CÁLCULOS ---
async function getYahooData(assetKey) {
    // Mapeo de símbolos Yahoo
    const symbols = { 'GOLD': 'GC=F', 'US30': '^DJI', 'EURUSD': 'EURUSD=X', 'GBPUSD': 'GBPUSD=X', 'USDJPY': 'USDJPY=X' };
    const sym = symbols[assetKey];
    
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${sym}?interval=${GLOBAL.tf}&range=5d`;
    // Usamos un proxy más rápido si es posible, o el mismo
    const proxy = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
    
    try {
        const res = await fetch(proxy);
        const data = await res.json();
        const result = data.chart.result[0];
        return result.timestamp.map((t, i) => ({
            time: t,
            open: result.indicators.quote[0].open[i],
            high: result.indicators.quote[0].high[i],
            low: result.indicators.quote[0].low[i],
            close: result.indicators.quote[0].close[i]
        })).filter(c => c.open != null);
    } catch (e) { return []; }
}

function actualizarIndicadores(candles) {
    // EMA
    const emaF = calculateEMA(candles, CONFIG.ema_fast);
    const emaS = calculateEMA(candles, CONFIG.ema_slow);
    emaFastSeries.setData(emaF);
    emaSlowSeries.setData(emaS);

    // RSI
    const rsiArr = calculateRSI(candles, CONFIG.rsi_period);
    const lastRSI = rsiArr.length > 0 ? rsiArr[rsiArr.length - 1].value : 50;
    document.getElementById('rsi-value').innerText = lastRSI.toFixed(2);
    
    // Señales
    const lastF = emaF[emaF.length-1]?.value;
    const lastS = emaS[emaS.length-1]?.value;
    const banner = document.getElementById('status-banner');
    const txt = document.getElementById('signal-text');

    if (lastF > lastS && lastRSI < 70) { 
        banner.className = 'buy'; txt.innerText = `🟢 CALL (COMPRA) - TF: ${GLOBAL.tf}`; 
    } else if (lastF < lastS && lastRSI > 30) { 
        banner.className = 'sell'; txt.innerText = `🔴 PUT (VENTA) - TF: ${GLOBAL.tf}`; 
    } else { 
        banner.className = 'neutral'; txt.innerText = "⚪ ESPERANDO ZONA"; 
    }
}

// --- FUNCIONES MATEMÁTICAS ESTÁNDAR ---
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

// --- LISTENERS Y UTILIDADES DE UI ---
function setupEventListeners() {
    document.getElementById('asset-selector').addEventListener('change', cargarActivo);
    
    // Botones de temporalidad
    window.cambiarTF = function(tf) {
        GLOBAL.tf = tf;
        // Actualizar botones visualmente
        document.querySelectorAll('.tf-btn').forEach(btn => {
            btn.classList.remove('active');
            if(btn.innerText.toLowerCase() === tf) btn.classList.add('active');
        });
        console.log("⏱️ Cambiando a:", tf);
        cargarActivo(); // Recarga todo con la nueva temporalidad
    };

    window.activarModoSMC = function() {
        document.getElementById('smc-info-card').style.display = 'block';
        alert("Modo SMC: Activando Order Blocks (Requiere actualización mañana)");
    };

    window.ejecutarDiagnostico = function() {
        let estado = GLOBAL.socket ? "🟢 WebSocket Binance Activo" : "🟠 Polling Yahoo Activo";
        alert(`ESTADO DEL SISTEMA:\nActivo: ${GLOBAL.asset}\nTF: ${GLOBAL.tf}\nConexión: ${estado}`);
    };
    
    // Botón de ajustes
    window.actualizarParametros = function() {
        CONFIG.ema_fast = parseInt(document.getElementById('input-ema-fast').value) || 9;
        CONFIG.ema_slow = parseInt(document.getElementById('input-ema-slow').value) || 21;
        CONFIG.rsi_period = parseInt(document.getElementById('input-rsi').value) || 14;
        cargarActivo(); // Recarga para aplicar cambios
    };
        }
