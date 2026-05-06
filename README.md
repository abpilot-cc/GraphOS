# 🕸️ GraphOS

> **AI-Operable Node Graph Runtime + Plugin System + HTTP-first API**

GraphOS 是一个通用的 **Node Graph 运行时系统**，旨在为 AI Agent 提供一个可观测、可编程、可扩展的“外部逻辑空间”。

它的核心理念是：
> **GraphOS 不提供 AI，它提供“AI 可以安全操作的世界结构”。**

---

## ✨ 核心定位

GraphOS 填补了 AI Agent 在处理复杂逻辑编排时的空白。它不仅仅是一个流程图，而是一个 **AI 的外部大脑皮层**，让 Agent 能够通过标准的 **Skill** 协议来构建、执行和管理结构化的任务流。

*   ✅ **Graph Runtime**: 纯粹的图逻辑引擎，管理节点（Node）与连线（Edge）。
*   ✅ **Skill-First**: 适配 `agent-skills` 规范，AI 通过 `SKILL.md` 学习如何控图。
*   ✅ **Auto-Bootstrapping**: 无需手动配置，安装技能后自动拉起运行时环境。
*   ✅ **HTTP-First**: 所有的图操作均为原子事务，天然适配 Function Calling。

---

## 🚀 快速开始：安装即使用

GraphOS 追求 **“零成本集成”**。你只需要安装技能，运行时会自动在后台就绪。

### 1. 安装技能
在你的 Agent 项目中，通过 `npx skills` 安装 GraphOS 技能包：
```bash
npx skills install @graphos/skill-management
```

### 2. 自动启动 (Zero Config)
当你的 AI Agent 第一次调用 GraphOS 技能（如 `get_graph_description`）时，系统会自动执行：
```bash
npx graphos-cli@latest start
```
此时，一个带可视化 UI 的图运行时将在本地 `8080` 端口静默启动，AI 即可开始绘图。

---

## 📂 项目结构

参考 `vercel-labs/agent-skills` 的架构，实现技能定义与运行时的深度整合：

```text
graphos/
├── packages/
│   ├── core/              # 核心运行时 (状态机、Hooks、插件加载器)
│   ├── server/            # HTTP API Server (Skill 的执行终点)
│   └── cli/               # 命令行工具 (用于 npx 快速启动)
├── skills/                # 🚀 AI 技能目录
│   └── graph-management/  
│       ├── SKILL.md       # 技能协议书 (包含 Tools 定义 & AI 指令)
│       ├── index.ts       # 技能逻辑实现 (包含运行时自动检测与启动)
│       └── types.ts       
├── SKILL.md               # 项目全局技能索引
├── package.json
└── README.md
```

---

## 🤖 技能体系 (Skill-Driven)

GraphOS 的一切能力都通过 `skills/graph-management/SKILL.md` 暴露给 AI。

### 核心工具 (Tools)
*   `get_graph_description`: 获取当前图中所有节点及其连接关系的文本摘要。
*   `get_available_node_types`: 查询系统中支持的节点库（如：HTTP 请求、逻辑分支、AI 总结）。
*   `apply_graph_transaction`: 批量提交图修改指令（创建节点、连线、更新数据）。

### 事务化操作
为了保证图的一致性，AI 的操作被封装为**事务**。这避免了网络波动导致的“残缺工作流”：
```json
// AI 发送的事务请求
{
  "ops": [
    { "op": "CREATE_NODE", "metadata": { "type": "http.request", "id": "n1" } },
    { "op": "CONNECT", "metadata": { "from": "n1", "to": "n2" } }
  ]
}
```

---

## 🎨 插件系统 (Plugin System)

GraphOS 通过插件注册节点类型。插件导出一个 `install(app)` 函数，在其中调用 `app.addNodeType(...)` 声明节点的元数据、属性定义以及允许的连线关系：

```typescript
export default function install(app) {
  app.addNodeType({
    type: "Variant",
    description: "Variant",
    properties: {
      name: {
        type: "string",
        description: "Name of the variant",
        required: true,
      },
      type: {
        type: ["string", "float", "integer", "boolean", "JSONSchema"],
        description: "Type of the variant",
        required: true,
        defaultValue: "string",
      },
      jsonSchema: {
        type: "JSONSchema",
        description: "JSON schema of the variant",
        defaultValue: {},
      },
      valueExpression: {
        type: "string",
        description: "Expression to compute the value of the variant",
        required: true,
      },
    },
    inTypes: ["World", "Context"],
    outTypes: [],
  });

  app.on("changed", (event) => {
    console.log("Graph changed:", event.data);
  });
}
```

节点类型定义与运行时校验规则由 `@graphos/core` 统一约束：

*   `properties` 用于声明节点属性，支持 `string`、`float`、`integer`、`boolean`、`JSONSchema`，以及字符串枚举数组。
*   `required: true` 的属性在节点实例中必须提供，否则校验失败。
*   `inTypes` 和 `outTypes` 定义当前节点允许连接的上游/下游节点类型，也可以使用 `'*'` 表示不限制。
*   `JSONSchema` 类型会在注册和赋值时进行 schema 有效性校验，避免把非法 schema 写入图。
*   `app.on("changed", handler)` 可监听图变更事件，回调中的 `event.data` 即当前完整图结构。

这使得插件既能扩展 UI 中可用的节点库，也能把节点的结构约束交给运行时统一验证。

---

## 🛡️ 安全与控制

*   **Dry Run (预览模式)**: AI 的复杂修改可以先在 UI 画布上进入“预览态”，由人类确认后再点击“生效”。
*   **回滚机制**: 所有的 `Transaction` 均可撤回。
*   **类型安全**: 严格校验节点端口的输入/输出类型，防止 AI 产生无效连接。

---

## 🏗️ 架构概览

```text
  [ AI Agent ] 
      │
      │ 1. Read SKILL.md
      ▼
[ GraphOS Skill ] ─── (Auto Start) ──▶ [ npx graphos-cli ]
      │                                     │
      │ 2. Call Transaction API             │ 3. Run Logic
      ▼                                     ▼
[ GraphOS Server ] ───────────────▶ [ Graph Runtime ]
                                            │
                                    [ Plugin / Nodes ]
```

---

## 🔭 路线图

- [x] 基于 `agent-skills` 的 `SKILL.md` 规范。
- [x] 运行时自动检测与静默启动逻辑。
- [x] 事务性 HTTP API。
- [ ] 网页端实时同步画布 (WebSocket)。
- [ ] 节点流式执行引擎 (DAG Executor)。
- [ ] 插件市场：支持从 npm 安装第三方节点包。

---

## 📜 License

MIT © [Your Name]

---

## 💡 愿景
**GraphOS 旨在成为 AI 时代的“逻辑基础设施”。** 无论是在构建自动化工作流，还是在模拟复杂的 Agent 决策系统，GraphOS 都能为 AI 提供一个可触摸、可感知的结构化世界。
