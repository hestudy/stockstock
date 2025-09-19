from fastapi import FastAPI
import structlog
from datetime import datetime
from typing import Optional, Dict, Any
from pydantic import BaseModel, Field

from .observability import (
    log_enqueue,
    log_start,
    log_end,
    log_error,
    Timer,
)

logger = structlog.get_logger()
app = FastAPI(title="Backtest Service")

# 简单的内存计时器存储（仅用于最小验证；生产应使用更稳健的作业上下文存储）
TIMERS: Dict[str, Timer] = {}

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


# ==== Minimal Observability Endpoints (Internal) ====

class EnqueueReq(BaseModel):
    jobId: str = Field(..., min_length=1)
    ownerId: str = Field(..., min_length=1)
    code: Optional[str] = None


@app.post("/internal/backtest/enqueue")
async def enqueue(req: EnqueueReq):
    log_enqueue(req.jobId, req.ownerId, code=req.code)
    return {"ok": True}


class StartReq(BaseModel):
    jobId: str
    ownerId: str
    retry: int = 0


@app.post("/internal/backtest/start")
async def start(req: StartReq):
    t = log_start(req.jobId, req.ownerId, retry=req.retry)
    TIMERS[req.jobId] = t
    return {"ok": True}


class EndReq(BaseModel):
    jobId: str
    ownerId: str


@app.post("/internal/backtest/end")
async def end(req: EndReq):
    t = TIMERS.pop(req.jobId, None)
    if t is None:
        # 若未显式 start，也记录一个极短持续时间，避免丢失结束日志
        t = Timer()
    log_end(req.jobId, req.ownerId, t)
    return {"ok": True}


class ErrorReq(BaseModel):
    jobId: str
    ownerId: str
    code: str  # PARAM_ERROR | UPSTREAM_ERROR | INTERNAL_ERROR
    message: str
    retry: int = 0
    extra: Optional[Dict[str, Any]] = None


@app.post("/internal/backtest/error")
async def error(req: ErrorReq):
    log_error(
        req.jobId,
        req.ownerId,
        code=req.code,
        message=req.message,
        retry=req.retry,
        extra=req.extra,
    )
    return {"ok": True}
