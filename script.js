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
// --- MOTOR SMC / LUXALGO LOGIC ---
const SMC_ENGINE = {
    // Configuración
    swing_length: 5, // Cuántas velas a la izquierda/derecha para confirmar un pivote

    analyze: function(candles) {
        let markers = [];
        let orderBlocks = []; // Guardaremos las zonas de OB
        
        // 1. Detectar Pivotes (Swing Highs / Lows)
        let pivots = this.getPivots(candles);
        
        // 2. Detectar BOS y Order Blocks
        let lastHigh = null;
        let lastLow = null;

        pivots.forEach(p => {
            if (p.type === 'H') {
                // Si rompe el último alto -> BOS Alcista
                if (lastHigh && p.price > lastHigh.price) {
                    // El movimiento que rompió viene de un Order Block Alcista (Bullish OB)
                    // Buscamos la vela roja más baja entre el Low anterior y este rompimiento
                    let obCandle = this.findOrderBlock(candles, lastLow.index, p.index, 'bullish');
                    if (obCandle) {
                        orderBlocks.push({ type: 'bullish', price: obCandle.high, time: obCandle.time });
                        markers.push({ time: candles[p.index].time, position: 'aboveBar', color: '#00bcd4', shape: 'arrowUp', text: 'BOS 🚀' });
                    }
                }
                lastHigh = p;
            } else {
                // Si rompe el último bajo -> BOS Bajista
                if (lastLow && p.price < lastLow.price) {
                    let obCandle = this.findOrderBlock(candles, lastHigh.index, p.index, 'bearish');
                    if (obCandle) {
                        orderBlocks.push({ type: 'bearish', price: obCandle.low, time: obCandle.time });
                        markers.push({ time: candles[p.index].time, position: 'belowBar', color: '#ff4081', shape: 'arrowDown', text: 'BOS 📉' });
                    }
                }
                lastLow = p;
            }
        });

        // 3. Generar Señales de Entrada (Re-test del OB)
        // Revisamos las últimas velas para ver si tocan un OB activo
        const currentPrice = candles[candles.length - 1].close;
        const lastOB = orderBlocks.length > 0 ? orderBlocks[orderBlocks.length - 1] : null;

        if (lastOB) {
            let entrySignal = false;
            let sl, tp;

            if (lastOB.type === 'bullish' && Math.abs(currentPrice - lastOB.price) / currentPrice < 0.002) {
                // Precio cerca del OB Alcista
                entrySignal = true;
                sl = lastOB.price * 0.998; // SL un poco abajo
                tp = currentPrice + (currentPrice - sl) * 2.5; // Ratio 1:2.5
                markers.push({ time: candles[candles.length - 1].time, position: 'belowBar', color: '#00e676', shape: 'arrowUp', text: 'ENTRY BUY 🎯', size: 2 });
            } 
            else if (lastOB.type === 'bearish' && Math.abs(currentPrice - lastOB.price) / currentPrice < 0.002) {
                // Precio cerca del OB Bajista
                entrySignal = true;
                sl = lastOB.price * 1.002; // SL un poco arriba
                tp = currentPrice - (sl - currentPrice) * 2.5; // Ratio 1:2.5
                markers.push({ time: candles[candles.length - 1].time, position: 'aboveBar', color: '#ff1744', shape: 'arrowDown', text: 'ENTRY SELL 🎯', size: 2 });
            }

            if (entrySignal) {
                console.log(`ESTRATEGIA SMC: Entrada detectada. TP: ${tp.toFixed(2)} | SL: ${sl.toFixed(2)}`);
                // Actualizar Banner
                const banner = document.getElementById('status-banner');
                const txt = document.getElementById('signal-text');
                banner.className = lastOB.type === 'bullish' ? 'buy' : 'sell';
                txt.innerText = `${lastOB.type === 'bullish' ? 'COMPRA' : 'VENTA'} EN OB | TP: ${tp.toFixed(2)}`;
            }
        }

        return markers;
    },

    getPivots: function(data) {
        let pivots = [];
        const L = this.swing_length;
        for (let i = L; i < data.length - L; i++) {
            let isHigh = true;
            let isLow = true;
            for (let j = 1; j <= L; j++) {
                if (data[i].high < data[i-j].high || data[i].high < data[i+j].high) isHigh = false;
                if (data[i].low > data[i-j].low || data[i].low > data[i+j].low) isLow = false;
            }
            if (isHigh) pivots.push({ type: 'H', price: data[i].high, index: i, time: data[i].time });
            if (isLow) pivots.push({ type: 'L', price: data[i].low, index: i, time: data[i].time });
        }
        return pivots;
    },

    findOrderBlock: function(data, startIndex, endIndex, type) {
        // Busca la última vela de color contrario antes del impulso
        let bestCandle = null;
        if (type === 'bullish') {
            // Buscamos la última vela roja (Open > Close) en el rango
            for (let i = endIndex; i >= startIndex; i--) {
                if (data[i].open > data[i].close) { // Vela Roja
                    return data[i];
                }
            }
        } else {
            // Buscamos la última vela verde (Close > Open)
            for (let i = endIndex; i >= startIndex; i--) {
                if (data[i].close > data[i].open) { // Vela Verde
                    return data[i];
                }
            }
        }
        return null;
    }
};
const KIRA_ALGO = {
    settings: {
        sma_long: 100,
        ema_80: 80,
        ema_50: 50,
        ema_20: 20,
        risk_per_trade: 0.01, // 1% de la cuenta
        min_rr: 2.5 // Ratio Riesgo:Beneficio mínimo
    },

    analyze: function(candles, currentSpread) {
        if (candles.length < 100) return null;

        // A. CÁLCULO DE INDICADORES
        const sma100 = calculateSMA(candles, this.settings.sma_long);
        const ema80 = calculateEMA(candles, this.settings.ema_80);
        const ema50 = calculateEMA(candles, this.settings.ema_50);
        const ema20 = calculateEMA(candles, this.settings.ema_20);

        const last = candles.length - 1;
        const price = candles[last].close;

        // B. DETECCIÓN DE SESIÓN (Evitar Spreads altos fuera de hora)
        const hour = new Date().getUTCHours();
        const isMarketActive = (hour >= 8 && hour <= 12) || (hour >= 13 && hour <= 17); // Londres y NY

        // C. LÓGICA SNIPER (BUY)
        const isBullishStack = ema20[last].value > ema50[last].value && ema50[last].value > ema80[last].value;
        const isAboveMacro = price > sma100[last].value;
        
        // Buscamos si el motor SMC ya detectó un Order Block Alcista
        const smcData = SMC_ENGINE.analyze(candles); 
        const lastMarker = smcData[smcData.length - 1];

        if (isBullishStack && isAboveMacro && isMarketActive && lastMarker?.text === 'ENTRY BUY 🎯') {
            return this.calculateTrade(price, 'BUY', currentSpread);
        }

        // D. LÓGICA SNIPER (SELL)
        const isBearishStack = ema20[last].value < ema50[last].value && ema50[last].value < ema80[last].value;
        const isBelowMacro = price < sma100[last].value;

        if (isBearishStack && isBelowMacro && isMarketActive && lastMarker?.text === 'ENTRY SELL 🎯') {
            return this.calculateTrade(price, 'SELL', currentSpread);
        }

        return null;
    },

    calculateTrade: function(price, type, spread) {
        // Cálculo Sniper con Spread incluido (JustMarket/Admirals)
        const pips_sl = 10; // SL dinámico (10 pips base)
        let sl, tp;

        if (type === 'BUY') {
            sl = price - (pips_sl * 0.0001) - spread;
            tp = price + ((price - sl) * this.settings.min_rr);
        } else {
            sl = price + (pips_sl * 0.0001) + spread;
            tp = price - ((sl - price) * this.settings.min_rr);
        }

        return { type, price, sl, tp, risk: "1%" };
    }
};
