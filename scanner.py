import yfinance as yf
import pandas_ta as ta
import requests
import os

# Configuración
SYMBOL = "BTC-USD"
EMA_F = 9
EMA_S = 21
WEBHOOK_URL = os.getenv("WEBHOOK_URL")

def check_market():
    data = yf.download(SYMBOL, period="1d", interval="15m")
    if data.empty: return

    data['EMA_F'] = ta.ema(data['Close'], length=EMA_F)
    data['EMA_S'] = ta.ema(data['Close'], length=EMA_S)
    data['RSI'] = ta.rsi(data['Close'], length=14)

    last_f = data['EMA_F'].iloc[-1]
    last_s = data['EMA_S'].iloc[-1]
    rsi = data['RSI'].iloc[-1]

    # Lógica de cruce
    if last_f > last_s and rsi < 70:
        msg = f"🟢 COMPRA: {SYMBOL} detectado por el Scanner automático."
        requests.post(WEBHOOK_URL, json={"mensaje": msg})
    elif last_f < last_s and rsi > 30:
        msg = f"🔴 VENTA: {SYMBOL} detectado por el Scanner automático."
        requests.post(WEBHOOK_URL, json={"mensaje": msg})

if __name__ == "__main__":
    if WEBHOOK_URL:
        check_market()
