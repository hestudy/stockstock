# Goals and Background Context

## Goals
- 以最短路径打通“编辑 → 回测 → 查看结果”的单人闭环，2 个月内交付可用 MVP。
- 支持参数网格寻优（并发、早停、重试），验证策略在参数空间下的稳健性。
- 提供可解释的绩效可视化（收益/回撤/夏普、交易列表），加强价值感知与留存。
- 建立最小的策略管理与软计费占位，为商业化验证与治理留出空间。

## Background Context
本项目面向具备一定编程基础的个人量化研究用户。用户的核心动机是以较低成本快速验证交易想法，并在统一的云端环境中完成从策略编辑、回测到结果理解的闭环。MVP 聚焦于日线与 5/15 分钟级别的历史数据，先不涉及实盘交易与 Tick 级数据，优先保证“可用、可看见价值”的路径。技术上通过 Next.js + Supabase + Python 回测服务 + Redis 队列，集中解决作业编排、数据频控与结果展示的一致性问题。

## Change Log
| Date | Version | Description | Author |
| --- | --- | --- | --- |
| 2025-09-10 | v1.0 | 初版 PRD（含 FR/NFR、UI/UX 目标、技术假设、Epics/Stories、Checklist 报告与 Next Steps） | John（PM） |

---
