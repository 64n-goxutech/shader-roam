---
name: gen-docs
description: Generate or incrementally update Mermaid-centered principle/architecture documentation under docs/architecture/{module}/README.md, and development implementation documentation under docs/dev/{module}. Use before starting each new feature implementation to turn the discussion/plan into architecture and development docs as needed, and after each modification, refinement, or debug fix to update the corresponding docs from the actual code changes. Also use when asked to document code architecture, module design, core principles, data structures, business flows, pseudocode, implementation plans, debugging notes, or development landing details.
---

# 原理文档生成

阅读讨论结果和代码后，生成或更新以 Mermaid 为核心的原理文档。已有文档时自动进入更新模式。

## 适用范围

- 每一次新功能开发之前：根据用户讨论、需求拆解和实现方案，先生成对应模块的原理文档。
- 每一次修改、完善或 debug 之后：根据实际改动内容，更新对应模块的原理文档。
- 用户明确要求生成架构、模块设计、核心原理、数据结构、业务流程或伪代码文档时。
- 用户明确要求生成实现计划、落地步骤、调试记录、开发说明或交付记录时。

## 输出目录

- 原理文档、架构图、模块设计、核心原理、核心数据结构、业务流程和伪代码：写入 `docs/architecture/{模块}/README.md`。
- 开发落地相关文档、实现计划、任务拆解、调试记录、变更说明、验收说明和交付记录：写入 `docs/dev/{模块}/README.md` 或 `docs/dev/{模块}/{主题}.md`。
- 同一模块同时需要两类文档时，保持两个目录的职责分离：`docs/architecture` 解释“为什么和如何工作”，`docs/dev` 记录“如何开发、修改和落地”。

## 规则

- 遵循项目规则。
- Mermaid 为主，能用图不用字。
- 保持简洁，说明原理，不堆砌实现细节。
- 使用伪代码描述流程，不写具体实现。
- 更新优先：已有文档时增量更新，不从零重写。

## 执行流程

1. 新功能开发前：读取当前讨论、需求和拟定方案，必要时补充读取相关源码，判断需要生成原理文档、开发落地文档，或两者都生成。
2. 修改、完善或 debug 后：读取本次改动涉及的源码，必要时结合 diff / 变更摘要，定位需要更新的 `docs/architecture` 和/或 `docs/dev` 文档。
3. 根据文档类型选择输出目录：原理文档进入 `docs/architecture/{模块}/README.md`，开发落地文档进入 `docs/dev/{模块}/...`。
4. 检查目标文档是否已存在。
5. 如果已有文档：读取现有文档，对比当前讨论或代码变化，增量更新，并用 `🆕` 标注新增内容、`⚡` 标注修改内容。
6. 如果没有文档：创建目标文档。原理文档按下方模板生成；开发落地文档按项目需要保持简洁结构。
7. 生成后检查 Mermaid 语法、模块职责表、数据结构和伪代码是否与讨论结果或源码一致。

## 文档模板

````markdown
# {功能名} 原理文档

## 1. 架构设计

```mermaid
graph TB
    %% 🆕 新增  ⚡ 修改
```

## 2. 模块设计

| 模块 | 职责 | 输入 | 输出 |
|------|------|------|------|

## 3. 核心原理

- 为什么这样设计 / 关键决策 / 算法思路

## 4. 核心数据结构

```typescript
interface CoreState {
  // ...
}
```

## 5. 业务流程

```mermaid
sequenceDiagram
```

## 6. 核心伪代码

```text
function 核心函数():
    1. ...
    2. ...
```
````

## 检查清单

- [ ] 已读相关源码。
- [ ] 新功能开发前已吸收讨论结果和实现方案。
- [ ] 修改、完善或 debug 后已对照实际改动更新文档。
- [ ] 原理文档已写入 `docs/architecture`，开发落地文档已写入 `docs/dev`。
- [ ] 架构图遵循 UI / Controller / 引擎分层。
- [ ] 伪代码能说明流程，且不是具体代码。
- [ ] 已有文档时只做必要增量更新。
- [ ] 新增或修改内容已用 `🆕` / `⚡` 标注。
