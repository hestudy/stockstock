## Introduction

本文件将为「A 股量化策略回测终端（SaaS）」提供统一的全栈架构蓝图，覆盖前端实现、后端系统与二者的集成方式，作为 AI 驱动的开发单一真实来源（Single Source of Truth）。我们将以 Monorepo 的代码组织为基础，前端采用 Next.js（App Router + TypeScript），后端以 Next.js API Routes（MVP 阶段）承载轻 API 层，并独立出 Python 回测/寻优服务与 Redis 队列，实现「编辑 → 回测 → 结果」的最短路径。该架构强调作业编排、数据频控、结果模型统一与高性能可视化，以满足 PRD 中关于首屏性能、队列时延、可观测性、成本效率与可扩展性的非功能需求（NFR）。

### Starter Template or Existing Project

- N/A - Greenfield project  
  PRD 未指明使用现有 Starter 或既有代码库。考虑到 Next.js + Supabase + Python 回测服务 + Redis 的组合常见于 Vercel/Supabase 快速迭代生态，我们后续将在「平台与基础设施选择」中给出 Vercel + Supabase 与自托管（或云厂商）备选路径，并在统一项目结构（Monorepo）与包边界上留出演进弹性。

### Change Log

| Date       | Version | Description                        | Author    |
| ---------- | ------- | ---------------------------------- | --------- |
| 2025-09-10 | v0.1    | 初稿：引言、项目基线与变更记录创建 | Architect |
