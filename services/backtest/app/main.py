import os

from fastapi import FastAPI, HTTPException, Header, Depends
import structlog
from datetime import datetime
from typing import Optional, Dict, Any, Literal
from pydantic import BaseModel, Field, field_validator

from .observability import (
    log_enqueue,
    log_start,
    log_end,
    log_error,
    Timer,
)
from .orchestrator import (
    create_optimization_job,
    ParamInvalidError,
    debug_jobs,
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


class EarlyStopPolicyModel(BaseModel):
    metric: str = Field(..., min_length=1)
    threshold: float
    mode: Literal["min", "max"]


class OptimizationCreateReq(BaseModel):
    ownerId: str = Field(..., min_length=1)
    versionId: str = Field(..., min_length=1)
    paramSpace: Dict[str, Any]
    concurrencyLimit: int = Field(2, ge=1)
    earlyStopPolicy: Optional[EarlyStopPolicyModel] = None
    estimate: int = Field(..., ge=1)

    @field_validator("paramSpace")
    @classmethod
    def validate_param_space(cls, value: Dict[str, Any]):
        if not isinstance(value, dict) or not value:
            raise ValueError("paramSpace must be a non-empty object")
        return value


def require_internal_secret(secret: Optional[str] = Header(None, alias="x-opt-shared-secret")):
    expected = os.getenv("OPTIMIZATION_ORCHESTRATOR_SECRET")
    if expected and secret != expected:
        raise HTTPException(
            status_code=403,
            detail={"code": "E.FORBIDDEN", "message": "invalid orchestrator credentials"},
        )


@app.post("/internal/optimizations")
async def optimizations(
    req: OptimizationCreateReq,
    _secret: None = Depends(require_internal_secret),
    owner_header: Optional[str] = Header(None, alias="x-owner-id"),
):
    if owner_header and owner_header != req.ownerId:
        raise HTTPException(
            status_code=403,
            detail={
                "code": "E.FORBIDDEN",
                "message": "owner mismatch",
                "details": {"ownerId": req.ownerId, "header": owner_header},
            },
        )
    try:
        payload = create_optimization_job(
            owner_id=req.ownerId,
            version_id=req.versionId,
            param_space=req.paramSpace,
            concurrency_limit=req.concurrencyLimit,
            early_stop_policy=req.earlyStopPolicy.dict() if req.earlyStopPolicy else None,
            estimate=req.estimate,
        )
        logger.info("optimization_job_created", job=payload, total_jobs=len(debug_jobs()))
        return payload
    except ParamInvalidError as exc:
        raise HTTPException(
            status_code=exc.status,
            detail={"code": exc.code, "message": str(exc), "details": exc.details},
        ) from exc
    except Exception as exc:  # pragma: no cover - defensive path
        logger.exception("optimization_job_failed", exc_info=exc)
        raise HTTPException(
            status_code=500,
            detail={"code": "E.INTERNAL", "message": "failed to create optimization job"},
        ) from exc
