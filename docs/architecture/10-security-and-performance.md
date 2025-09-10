## Security and Performance

### Security Requirements

**Frontend Security**

- CSP Headers：默认 `default-src 'self'; script-src 'self' 'unsafe-inline' vercel.live; connect-src 'self' supabase.co supabase.in vercel.app https:`（依平台精细化）
- XSS 防护：React 默认转义；禁用危险 `dangerouslySetInnerHTML`；对富文本/日志输出使用 whitelist sanitizer
- Secure Storage：仅在客户端保存必要的会话信息；优先使用 Supabase/HttpOnly Cookies 管理会话；本地缓存避免敏感数据

**Backend Security**

- 输入校验：对齐 OpenAPI/TS 类型；在 API 层做 schema 校验与错误归一化
- Rate Limiting：对 `submit`/`opt` 等写操作进行用户级速率限制（Redis 令牌桶），并记录事件
- CORS Policy：仅允许前端域名与内部服务调用；分环境配置白名单
- 最小权限：Supabase Service Key 仅在受信任环境（Serverless/Workers）使用；前端仅用 ANON Key

**Authentication Security**

- Token Storage：使用 Supabase 提供的会话管理（HttpOnly Cookie）；避免在 `localStorage` 永久保存令牌
- Session Management：前端路由保护在 `app/(dashboard)/layout.tsx`；API 层统一解析并下游传递 `ownerId`
- Password Policy：遵循 Supabase 默认策略，前端提示强口令与 2FA（可后续加入）

### Performance Optimization

**Frontend Performance**

- Bundle Size Target：初始 < 300KB（gzip）；按需拆分与懒加载图表组件
- Loading Strategy：SSR + 渐进式数据获取（SWR/Query），“摘要先行 → 曲线 → 明细”
- Caching Strategy：SWR/HTTP 缓存（短期）、结果摘要可本地缓存以减少重复请求

**Backend Performance**

- Response Time Target：API 常规请求 P95 < 200ms（不含计算）；状态/摘要接口优先
- Database Optimization：关键查询（历史列表、状态读取）走覆盖索引；避免大事务
- Caching Strategy：Redis 用于队列与热点摘要缓存；外部数据源走适配层缓存/频控

**Queue/Compute SLO**

- 队列等待：平均 ≤ 30s，P95 ≤ 2min（对齐 NFR1）
- 早停策略：在寻优中基于指标阈值尽早终止劣质组合
- 重试/退避：指数退避并设上限；分类错误（外部依赖/执行/参数）
