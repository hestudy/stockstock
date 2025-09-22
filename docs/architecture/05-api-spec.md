## API Specification（REST, OpenAPI 3 骨架）

说明

- 认证：采用 Supabase Auth（JWT）携带于 `Authorization: Bearer <token>`；服务端据此解析 `ownerId`。
- 版本：`/api/v1` 作为前缀；错误返回统一 `ApiError` 结构。
- 契约来源：与 `packages/shared/types/` 中的 TS 接口对齐；Python 侧以 pydantic schema 映射。

````yaml
openapi: 3.0.0
info:
  title: StockStock Fullstack API
  version: 0.1.0
  description: MVP endpoints for backtest and optimization workflows
servers:
  - url: https://{host}/api/v1
    variables:
      host:
        default: example.com

paths:
  /backtests:
    post:
      summary: Submit a backtest job
      security: [{ bearerAuth: [] }]
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/BacktestSubmitRequest'
      responses:
        '202':
          description: Accepted
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/BacktestSubmitResponse'

  /backtests/{id}/status:
    get:
      summary: Get backtest job status
      security: [{ bearerAuth: [] }]
      parameters:
        - in: path
          name: id
          required: true
          schema: { type: string }
      responses:
        '200':
          description: OK
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/BacktestStatusResponse'

  /backtests/{id}/result:
    get:
      summary: Get backtest result summary
      security: [{ bearerAuth: [] }]
      parameters:
        - in: path
          name: id
          required: true
          schema: { type: string }
      responses:
        '200':
          description: OK
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ResultSummary'

  /backtests/{id}/cancel:
    post:
      summary: Cancel a running backtest job
      security: [{ bearerAuth: [] }]
      parameters:
        - in: path
          name: id
          required: true
          schema: { type: string }
      responses:
        '202': { description: Accepted }

  /optimizations:
    post:
      summary: Submit an optimization (grid search) job
      security: [{ bearerAuth: [] }]
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/OptimizationSubmitRequest'
      responses:
        '202':
          description: Accepted
          headers:
            x-param-space-estimate:
              description: Cartesian product estimate of submitted param space (capped by OPT_PARAM_SPACE_MAX)
              schema: { type: integer, minimum: 1 }
            x-concurrency-limit:
              description: Effective concurrency limit after applying server-side cap (max 16)
              schema: { type: integer, minimum: 1, maximum: 16 }
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/OptimizationSubmitResponse'

  /optimizations/{id}/status:
    get:
      summary: Get optimization parent job status and aggregation
      security: [{ bearerAuth: [] }]
      parameters:
        - in: path
          name: id
          required: true
          schema: { type: string }
      responses:
        '200':
          description: OK
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/OptimizationStatusResponse'

  /health:
    get:
      summary: Health/Canary endpoint
      responses:
        '200':
          description: OK
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/HealthStatus'

components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT

  schemas:
    ApiError:
      type: object
      properties:
        error:
          type: object
          properties:
            code: { type: string }
            message: { type: string }
            details: { type: object, additionalProperties: true }
            timestamp: { type: string }
            requestId: { type: string }

    BacktestSubmitRequest:
      type: object
      required: [versionId, params]
      properties:
        versionId: { type: string }
        params:
          type: object
          additionalProperties: true
    BacktestSubmitResponse:
      type: object
      properties:
        id: { type: string }
        status: { $ref: '#/components/schemas/JobStatus' }

    BacktestStatusResponse:
      type: object
      properties:
        id: { type: string }
        status: { $ref: '#/components/schemas/JobStatus' }
        progress: { type: number }
        retries: { type: integer }
        error: { $ref: '#/components/schemas/ApiError' }
        resultSummaryId: { type: string }

    OptimizationSubmitRequest:
      type: object
      required: [versionId, paramSpace]
      properties:
        versionId: { type: string }
        concurrencyLimit:
          type: integer
          default: 2
          minimum: 1
          maximum: 16
        earlyStopPolicy:
          type: object
          properties:
            metric: { type: string }
            threshold: { type: number }
            mode: { type: string, enum: [min, max] }
        paramSpace:
          type: object
          additionalProperties: true
    OptimizationSubmitResponse:
      type: object
      properties:
        id: { type: string }
        status: { $ref: '#/components/schemas/JobStatus' }

    OptimizationStatusResponse:
      type: object
      properties:
        id: { type: string }
        status: { $ref: '#/components/schemas/JobStatus' }
        summary:
          type: object
          properties:
            total: { type: integer }
            finished: { type: integer }
            topN:
              type: array
              items:
                type: object
                properties:
                  taskId: { type: string }
                  score: { type: number }

    JobStatus:
      type: string
      enum: [queued, running, succeeded, failed, early-stopped, canceled]

    ResultSummary:
      type: object
      properties:
        id: { type: string }
        ownerId: { type: string }
        metrics:
          type: object
          additionalProperties: { type: number }
        equityCurveRef: { type: string }
        tradesRef: { type: string }
        artifacts:
          type: array
          items:
            type: object
            properties:
              type: { type: string }
              url: { type: string }
        createdAt: { type: string }

    HealthStatus:
      type: object
      properties:
        service: { type: string, enum: [api, worker, queue, datasource] }
        status: { type: string, enum: [up, degraded, down] }
        details: { type: object, additionalProperties: true }
        ts: { type: string }
````
