# 控制系统开发文档

## 目标

把现有输入和飞控逻辑拆成可扩展控制系统，并将落日飞车更新为符合日常方向直觉、会自动回正的 arcade 操控。

## 实现计划

1. ⚡ 新建 `src/controls` 模块。
2. ⚡ 定义 `RawInputState`、`ControlSettings`、`FlightCommand`。
3. ⚡ 将现有 `InputController` 拆分为 `KeyboardPointerInput`。
4. ⚡ 新增 `ControlSystem`，负责输入映射、灵敏度、死区、平滑和反转。
5. ⚡ `ArcadeFlyingCar` 消费 `FlightCommand`，控制语义不依赖具体模型。
6. ⚡ `Experience` 每帧先更新输入源，再更新控制系统，最后更新飞车。
7. ⚡ 构建验证。
8. 🆕 将转向键改为 `A/D`，手动侧倾改为 `Q/E`，上方向键改为爬升。
9. 🆕 将运动根节点和视觉姿态根节点分离，加入受限俯仰、自动回正、协调侧倾和轻微方向惯性。
10. 🆕 让 orbit 相机按航向变化保持相对观察角度，`R` 重置到当前车尾后方。

## 本次落地内容

- 🆕 `src/controls/types.ts`：控制系统数据结构和默认参数。
- 🆕 `src/controls/math.ts`：`clamp`、`deadzone`、指数平滑工具。
- 🆕 `src/controls/KeyboardPointerInput.ts`：键鼠输入源，只输出原始输入快照。
- 🆕 `src/controls/ControlSystem.ts`：从原始输入生成 `FlightCommand`。
- ⚡ `src/vehicles/ArcadeFlyingCar.ts`：消费 `FlightCommand`，不依赖 DOM 输入状态或 GLB 生命周期。
- ⚡ `src/engine/Experience.ts`：接入 `KeyboardPointerInput -> ControlSystem -> ArcadeFlyingCar` 更新链路。
- ⚡ 删除旧 `src/input/InputController.ts`。
- ⚡ `ControlSystem` 将 `A/D` 与左右方向键统一映射为 yaw，将 `Q/E` 映射为只影响视觉的 roll；上方向键改为正 pitch。
- 🆕 `Experience` 将飞车拆成 motion root 与 visual root，异步加载的占位车/AE86 只替换 visual root 子节点。
- ⚡ `ArcadeFlyingCar` 使用世界上方向航向和 `±38°` 受限俯仰；旅行方向以 sharpness `10` 跟随车头，松开俯仰后以 `1.65` 回平。
- 🆕 转向产生最多约 `22°` 自动协调侧倾，`Q/E` 提供最多 `30°` 手动侧倾，组合后限制在 `±38°` 并以 `6.8` 回正。
- 🆕 纵向加速度在 visual root 产生最多约 `±4.5°` 点头反馈；物理运动四元数保持无滚转。
- ⚡ 刹车优先于油门，最低巡航速度从 `38` 调整到 `28`，增强减速反馈但保留持续飞行。
- 🆕 载具姿态与期望/实际旅行方向已加入运行诊断。

## 验证记录

- ⚡ `npm run build` 通过。
- ⚡ 构建后入口模块数从 15 增至 18，控制系统拆分已被打包。
- 🆕 输入映射数值验证通过：`A`、`Q`、`ArrowUp` 分别稳定输出正 yaw、roll、pitch；`ArrowLeft` 与 `A` 等价。
- 🆕 左/右转向验证通过：两者产生符号相反的横向航迹、heading 和视觉侧倾。
- 🆕 爬升与回正验证通过：持续上方向键产生正高度/正垂直速度，松开 5 秒后 pitch 约 `0.00017 rad`。
- 🆕 `Q` 单独保持 1.5 秒时 heading 与横向位移均为 `0`，确认手动侧倾不会污染运动方向。
- 🆕 40 秒组合操控模拟通过：姿态始终在 `±38°` 内，位置、速度、方向和诊断均为有限值。
- 🆕 60 秒飞车与程序化运动参照联合模拟通过；持续转向、爬升和速度变化未产生非有限状态或无界场景坐标。

## 控制映射

| 输入 | 命令 | 说明 |
|------|------|------|
| `W` | `throttle = 1` | 加速 |
| `S` | `brake = 1` | 减速 |
| `A / D` | `yaw = 1 / -1` | 左转 / 右转，并自动协调侧倾 |
| `ArrowLeft / ArrowRight` | `yaw = 1 / -1` | `A / D` 的等价方向键输入 |
| `Q / E` | `roll = 1 / -1` | 左侧倾 / 右侧倾，不直接改变航向 |
| `ArrowUp / ArrowDown` | `pitch = 1 / -1` | 爬升 / 俯冲，松键自动回平 |
| 鼠标左键拖拽 | 无飞行命令 | 固定交给 `OrbitControls` 自由观察 |
| `Shift` | `boost = true` | 加力 |

## 设计约束

- 输入源不直接修改载具状态。
- 载具控制器不读取 DOM 事件。
- 控制命令保持无 Three.js 类型，方便测试和后续接入其他平台。
- `FlightCommand` 只描述意图，不表达具体动力学。
- 🆕 真实运动姿态不包含视觉滚转，避免外观反馈反向污染运动方向。
- 🆕 航向变化使用世界上方向，车辆侧倾后 `A/D` 的左右语义仍保持稳定。
- 🆕 俯仰和视觉侧倾均有角度上限及帧率无关回正。

## 验证项

- `npm run build` 通过。
- W/S 能影响速度。
- A/D 改变航向且自动压弯，Q/E 只改变视觉侧倾。
- 上/下方向键分别爬升/俯冲，松键后逐步回平。
- Shift 能进入 boost。
- 后续接入手柄时不需要修改 `ArcadeFlyingCar`。
