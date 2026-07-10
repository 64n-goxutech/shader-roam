# 控制系统开发文档

## 目标

把现有输入和飞控逻辑拆成可扩展控制系统，为后续手柄、第一人称驾驶舱、自动巡航和不同载具手感做准备。

## 实现计划

1. ⚡ 新建 `src/controls` 模块。
2. ⚡ 定义 `RawInputState`、`ControlSettings`、`FlightCommand`。
3. ⚡ 将现有 `InputController` 拆分为 `KeyboardPointerInput`。
4. ⚡ 新增 `ControlSystem`，负责输入映射、灵敏度、死区、平滑和反转。
5. ⚡ `ArcadeFlyingCar` 消费 `FlightCommand`，控制语义不依赖具体模型。
6. ⚡ `Experience` 每帧先更新输入源，再更新控制系统，最后更新飞车。
7. ⚡ 构建验证。

## 本次落地内容

- 🆕 `src/controls/types.ts`：控制系统数据结构和默认参数。
- 🆕 `src/controls/math.ts`：`clamp`、`deadzone`、指数平滑工具。
- 🆕 `src/controls/KeyboardPointerInput.ts`：键鼠输入源，只输出原始输入快照。
- 🆕 `src/controls/ControlSystem.ts`：从原始输入生成 `FlightCommand`。
- ⚡ `src/vehicles/ArcadeFlyingCar.ts`：消费 `FlightCommand`，不依赖 DOM 输入状态或 GLB 生命周期。
- ⚡ `src/engine/Experience.ts`：接入 `KeyboardPointerInput -> ControlSystem -> ArcadeFlyingCar` 更新链路。
- ⚡ 删除旧 `src/input/InputController.ts`。

## 验证记录

- ⚡ `npm run build` 通过。
- ⚡ 构建后入口模块数从 15 增至 18，控制系统拆分已被打包。

## 控制映射

| 输入 | 命令 | 说明 |
|------|------|------|
| `W` | `throttle = 1` | 加速 |
| `S` | `brake = 1` | 减速 |
| `A / D` | `roll = 1 / -1` | 左右滚转 |
| `Q / E` | `yaw = 1 / -1` | 左右偏航 |
| `ArrowUp / ArrowDown` | `pitch = -1 / 1` | 俯仰 |
| 鼠标左键拖拽 | 无飞行命令 | 固定交给 `OrbitControls` 自由观察 |
| `Shift` | `boost = true` | 加力 |

## 设计约束

- 输入源不直接修改载具状态。
- 载具控制器不读取 DOM 事件。
- 控制命令保持无 Three.js 类型，方便测试和后续接入其他平台。
- `FlightCommand` 只描述意图，不表达具体动力学。

## 验证项

- `npm run build` 通过。
- W/S 能影响速度。
- A/D/Q/E/方向键和鼠标拖拽能影响姿态。
- Shift 能进入 boost。
- 后续接入手柄时不需要修改 `ArcadeFlyingCar`。
