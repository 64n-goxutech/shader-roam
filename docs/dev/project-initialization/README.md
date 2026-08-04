# 项目初始化开发文档

> ⚡ 2026-08-04：初始化阶段的落日环境实现已删除，本文保留历史搭建记录；当前运行时交付见 `docs/dev/core-drive/README.md`。

## 目标

初始化一个可扩展的 Three.js + TypeScript 飞行体验项目。⚡ 当前默认组合已更新为“落日体积云场景 + Toyota AE86 飞车”，后续仍可切换不同场景和载具。

## 技术取舍

| 选项 | 结论 | 原因 |
|------|------|------|
| Three.js | 采用 | 直接控制 shader、相机、render loop、GLTF 加载和后处理，适合本项目核心 |
| R3F | 暂不采用 | 需要 React 运行时和组件抽象，当前没有复杂 React UI 需求 |
| 物理库 | 暂不采用 | 初版飞行手感用 arcade 控制更直接，后续碰撞/刚体再评估 Rapier |
| 飞控库 | 暂不采用 | 浏览器端没有成熟通用的“飞行器手感库”，核心控制自研更稳 |
| AI/路径库 | 暂不采用 | YUKA 适合自动驾驶/巡航/路径行为，不适合作为玩家飞行控制核心 |

## 依赖规划

### MVP 必需

- `three`：3D 引擎、ShaderMaterial、GLTFLoader、数学工具。
- `typescript`：类型系统，约束 `VehicleState` / `FlightCommand` / 配置结构。
- `vite`：开发服务器和构建工具。
- `@types/three`：Three.js TypeScript 类型声明，覆盖核心包和 examples loader 类型。

### 后续按需

- `lil-gui`：调试 shader、飞控参数、质量档位。
- `stats.js`：性能监控。
- `@dimforge/rapier3d-compat`：需要真实碰撞、触发体或刚体时再引入。
- `yuka`：需要 AI 飞行、自动巡航、编队或路径跟随时再引入。
- `@react-three/fiber`：需要 React 驱动复杂 UI/状态和组件化 3D 页面时再评估。

## 初始化步骤

1. ⚡ 创建 Vite + TypeScript 项目基础文件：`package.json`、`tsconfig.json`、`index.html`。
2. ⚡ 安装 `three`、`vite`、`typescript`、`@types/three`。
3. ⚡ 建立模块目录：`engine`、`input`、`vehicles`、`camera`、`environments`、`shaders`、`config`。
4. ⚡ 实现落日 shader 环境：`SunsetEnvironment` + `sunsetSky`。
5. ⚡ 实现 arcade 飞车控制和 orbit 相机：`ArcadeFlyingCar` + `OrbitCameraRig`。
6. ⚡ 接入 GLTF 模型加载与包围盒规范化：`loadVehicleModel.ts`、`public/models/vehicles`。
7. ⚡ 验证 `npm run build`。
8. 🆕 以 `main` 为默认分支初始化 Git 仓库，将源码、锁文件、文档和模型授权信息纳入首个提交。

## Git 仓库初始化

- 🆕 默认分支：`main`。
- 🆕 首个提交包含应用源码、项目配置、依赖锁文件、开发与架构文档，以及 AE86 模型和授权说明。
- 🆕 `node_modules/`、`dist/`、`.DS_Store`、`.npm-cache/` 和本机 `*.local` 配置由 `.gitignore` 排除。
- 🆕 初始化验收：工作区无未提交变更，忽略文件未进入索引，`npm run build` 通过。

## 本次落地内容

- 🆕 `src/engine/Experience.ts`：统一初始化 renderer、scene、camera、input、vehicle、environment 和 render loop。
- ⚡ `src/controls/KeyboardPointerInput.ts`：键盘 + 鼠标拖拽输入，输出 `RawInputState`。
- 🆕 `src/controls/ControlSystem.ts`：将原始输入转换为稳定 `FlightCommand`。
- ⚡ `src/vehicles/ArcadeFlyingCar.ts`：自研 arcade 飞车控制，包含速度、俯仰、偏航、滚转和 boost。
- ⚡ `src/vehicles/createPlaceholderFlyingCar.ts`：GLB 加载完成前或失败时提供飞车占位视觉。
- 🆕 `src/vehicles/loadVehicleModel.ts`：加载 AE86，并按包围盒统一长度和中心。
- ⚡ `src/environments/SunsetEnvironment.ts`：落日环境、体积云、暖色雾和低角度太阳光。
- ⚡ `src/shaders/sunsetSky.ts`：落日天空、日盘、地平线与体积云 shader。
- ⚡ `src/camera/OrbitCameraRig.ts`：OrbitControls 自由视角，以车身中心为 target 并从后上方观察。
- 🆕 `public/models/vehicles/toyota-ae86`：AE86 GLB 与 CC BY 4.0 attribution。
- ⚡ `Experience` 使用 `THREE.Timer`，消除 `Clock` 弃用警告并处理页面可见性切换。
- 🆕 `.gitignore`：忽略构建产物、依赖目录和本机文件。

## 验证记录

- ⚡ `npm run build` 通过。
- 🆕 Git 仓库以 `main` 为默认分支完成初始化并创建首个提交。
- 🆕 Git 索引检查通过，依赖、构建产物和本机文件均未进入提交。
- ⚡ Vite dev server 已启动：`http://127.0.0.1:5173/`。
- ⚡ `curl -I http://127.0.0.1:5173/` 返回 `200 OK`。
- 🆕 AE86 URL 返回 `200 OK`、`model/gltf-binary`，资源大小 `1604336` 字节。
- ⚡ `npm run build` 在落日主题迁移后通过，共转换 24 个模块。
- ⚡ 浏览器控制端当前没有可用会话，未能执行 WebGL 截图/像素级验证。

## 验收

- 页面可启动并渲染非空 Three.js 场景。
- AE86 加载成功后替换飞车占位视觉，失败时保留占位车。
- 飞车可通过键盘控制移动和姿态变化。
- 落日天空和体积云根据时间、相机和太阳方向变化。
- 代码结构支持后续替换 environment / vehicle。
