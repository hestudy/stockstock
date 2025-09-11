from fastapi import FastAPI
import structlog
from datetime import datetime

logger = structlog.get_logger()
app = FastAPI(title="Backtest Service")

@app.get("/internal/health")
async def internal_health():
    payload = {
        "service": "backtest",
        "status": "up",
        "details": {"worker": "unknown", "queue": "unknown"},
        "ts": datetime.utcnow().isoformat(),
    }
    logger.info("internal_health", **payload)
    return payload
