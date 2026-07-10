# 落日体积云开发文档

## 目标

用原创 GLSL 构成落日天空与体积云，在保留云层空间感和性能预算的同时，建立暖色地平线、低角度太阳与紫红云影主题。

## 授权约束

- 目标 Shadertoy 代码头部声明禁止在项目、网站、产品中使用，也禁止修改后分发。
- 本项目不复制其源码、不复用其纹理资源、不按行改写。
- 只实现通用技术路线：raymarch、procedural noise、简化光照、前向透明合成。

## 实现计划

1. ⚡ 使用 `src/shaders/sunsetSky.ts` 实现落日天空与体积云 fragment shader。
2. ⚡ 使用原创 3D value noise / fBM，不依赖 Shadertoy `iChannel`。
3. ⚡ 添加云层高度范围、密度、太阳方向、雾化和曝光。
4. ⚡ 由 `SunsetEnvironment` 管理 shader、雾、半球光、方向光与诊断。
5. ⚡ 构建验证。

## 云层不可见诊断计划（2026-07-10）

1. 🆕 在启动阶段记录运行版本、质量档位、canvas 尺寸和 WebGL 能力。
2. 🆕 在 shader 编译/链接阶段记录 defines、uniform 列表、源码特征和完整错误日志。
3. 🆕 在云球渲染前后记录 draw callback，确认 mesh 确实进入 GPU 绘制链路。
4. 🆕 首帧与节流周期记录相机、云层交段、uniform 同步、renderer program/draw call 和帧缓冲像素。
5. 🆕 暴露 `window.__shaderRoamDebug.dump()`，供 Chrome DevTools 主动抓取即时快照。
6. 🆕 构建后在正常 Chrome WebGL 环境采集 console，依据证据定位云层消失阶段。

## 云层密度饱和修复（2026-07-10）

### 根因

- ⚡ 埋点确认云球持续完成 draw call，问题不在模块创建、shader 提交或动画循环。
- ⚡ 默认相机高度约为 `525`，处于 `120-1160` 云层内部；所有主要视线都会进入云层。
- ⚡ 上一轮 `0.30-0.50` coverage、基础高度密度、stratus 与 `1.85` 增益叠加后，大多数采样 density 被截断为 `1.0`。
- ⚡ 默认五个屏幕探针的离线复算累计 alpha 为 `0.868-0.988`；云并非透明，而是退化成缺少轮廓的全屏平滑雾色。

### 实现

- ⚡ shader 版本更新为 `cloud-sky-2026-07-10.2`。
- ⚡ 诊断快照新增密度配置字段，诊断版本同步更新为 `cloud-render-console-2026-07-10.2`。
- ⚡ fBM 按实际 octave 权重归一化，coverage 改为 `0.48-0.64`，移除基础高度密度、stratus 和 `1.85` 饱和增益。
- ⚡ medium noise 通过 `0.58-1.0` billow 权重调制云体，高质量 detail 改为以 `0.5` 为中心的无偏扰动。
- ⚡ sample alpha 改为 Beer-Lambert 消光，extinction 为 `0.0015`；默认复算五探针 alpha 分布变为 `0-0.895`，中心约 `0.339`。
- ⚡ jitter 改用稳定像素种子，避免 `fract(iTime)` 导致逐帧随机采样闪烁。
- ⚡ 初始化日志与诊断快照新增 `cloudDensityProfile` / `densityProfile`，便于核对实际运行参数。

## 落日主题迁移（2026-07-10）

- 🆕 `cloudSky` / `CloudEnvironment` 迁移为 `sunsetSky` / `SunsetEnvironment`，环境 ID 更新为 `sunset-drive`。
- 🆕 太阳方向更新为 `(0.32, 0.18, -0.93)`，世界空间保持低角度；默认相机下日盘位于首屏右上区域。
- 🆕 天空改为暖橙地平线、紫色中层和深蓝高空，日盘使用金色核心与橙红辉光。
- 🆕 云影改为深紫红，受光面改为桃橙/金色；密度、coverage 和 Beer-Lambert 消光参数保持不变。
- 🆕 场景光改为暖色 `HemisphereLight` + 低角度 `DirectionalLight`，雾色同步为紫红色。
- 🆕 debug uniform/API 更新为 `uAtmosphereDebugMode` / `setAtmosphereDebugMode()`，诊断版本更新为 `sunset-render-console-2026-07-10.1`。

## 本次落地内容

- 🆕 `hash13` / `valueNoise` / `fbm`：原创程序噪声。
- 🆕 `cloudDensity`：世界空间云层密度场，包含风向时间偏移和高度遮罩。
- 🆕 `marchClouds`：单 pass raymarch，使用前向 alpha 合成。
- 🆕 简化太阳方向二次采样：估算云体亮边和阴影。
- ⚡ 沿用 `SunsetEnvironment` 的 `iTime`、`iResolution`、`uCameraPosition`、`vehiclePosition`、`sunDirection` uniforms。
- ⚡ 将自定义相机 uniform 从 `cameraPosition` 改为 `uCameraPosition`，避开 Three.js `ShaderMaterial` 内置注入名。
- ⚡ coverage 使用归一化密度阈值并保留透明空隙，让云体在默认视角下形成可辨识边界。
- ⚡ `sunsetSkyQualityDefines` 用质量档位控制 raymarch 步数、fBM 层数、最远采样距离和二次光照采样。
- ⚡ 默认质量从 `medium` 调整为 `low`，渲染像素比 low 固定为 `1`，降低高分屏下的全屏 shader 压力。
- ⚡ 修复“只有太阳和天空、看不到云”的可见性问题：保留 low 的 16 步预算，归一化 fBM，使用稀疏 coverage / billow 密度和步长稳定的 Beer-Lambert 消光。
- 🆕 新增 `src/diagnostics/renderDiagnostics.ts`：记录 GPU 能力、shader 链接错误、renderer program、draw call 和少量帧缓冲像素。
- ⚡ `SunsetEnvironment` 保留 init/resize/update/compile/draw 分阶段日志，并校验相机 uniform、天空球中心和中心视线云层交段。
- 🆕 `Experience` 在首帧及每 5 秒输出节流快照，避免 console 埋点重新引入逐帧卡顿。
- ⚡ 调试 API 为 `window.__shaderRoamDebug.dump()` / `snapshot()` / `setAtmosphereDebugMode()`。
- 🆕 shader 增加默认关闭的交段视图（模式 `1`）和积分透明度视图（模式 `2`）；模式 `0` 保持正常渲染。

## 验证记录

- ⚡ `npm run build` 通过。
- ⚡ dev server 返回新 shader，确认包含 `cloudDensity`、`marchClouds`、`CLOUD_MARCH_STEPS`。
- ⚡ dev server 返回相机实现，确认只保留 `OrbitCameraRig`，鼠标固定交给 orbit 视角。
- ⚡ Vite 日志确认旧问题为 shader 编译失败：`uCameraPosition` 未声明；修复后构建通过，dev server 返回新 shader。
- ⚡ 当前自动浏览器/Chrome 插件不可用；本地无头 Chrome 环境禁用 WebGL，只能确认无 TypeScript/Vite 构建错误，页面视觉需在正常浏览器中复核。
- ⚡ 针对页面严重卡顿：将默认 raymarch 从 48 步降到 low 的 12 步，关闭 low/medium 的太阳方向二次密度采样，`npm run build` 通过。
- ⚡ 2026-07-10 复核云层不可见：确认 sky sphere shader 在运行；上一轮“density/alpha 太保守”的判断在增益调整后已不成立，实际问题变为 density/alpha 饱和。
- 🆕 2026-07-10：`npm run build` 通过，Vite `http://127.0.0.1:5173` 返回诊断版本 `cloud-render-console-2026-07-10.1` 与最新 shader。
- 🆕 2026-07-10：Chrome、ChatGPT Chrome Extension 与 native host 只读检查均正常，但浏览器控制端尚未发现可用会话；实际 WebGL console 采集等待打开插件绑定的 Chrome 窗口后继续。
- 🆕 2026-07-10：用户授权后调用插件窗口启动脚本，macOS 返回 `kLSNoExecutableErr`（`/Applications/Google Chrome.app` 无法启动新实例）；等待 2 秒后的唯一一次扩展重试仍返回 `Browser is not available: extension`。需要从 ChatGPT 插件界面重新安装 Chrome 插件后再采集 DevTools console。
- 🆕 2026-07-10：用户重新安装 Chrome 插件后复测，扩展启用状态与 native host 仍全部通过，但窗口启动继续返回同一 `kLSNoExecutableErr`，扩展会话仍为空。扩展重装已排除，下一步需要修复或重新安装 `/Applications/Google Chrome.app` 后再连接。
- ⚡ 2026-07-10：`cloud-sky-2026-07-10.2` 修复后 `npm run build` 通过；开发服务器与生产 bundle 均包含归一化密度配置和 Beer-Lambert 消光。
- ⚡ 2026-07-10：离线数值回归确认默认视角不再全屏饱和；浏览器控制端仍无可用会话，未生成 WebGL 截图，需在正常 Chrome 中完成最终视觉验收。
- 🆕 2026-07-10：落日主题迁移后 `npm run build` 通过，Vite 转换 24 个模块；开发服务器返回 `sunset-sky-2026-07-10.1`。
- 🆕 2026-07-10：浏览器控制端列表仍为空，无法完成截图和 canvas 像素验收；资源、构建和 shader 源码检查已通过。

## 验证项

- `npm run build` 通过。
- shader 不依赖外部 Shadertoy texture。
- 页面显示落日天空、低角度太阳和体积云。
- 正常模式同时存在清晰天空空隙、局部半透明云和高密度云体，不应全屏接近同一颜色。
- 调试模式 `2` 的探针不应全部接近纯黑或纯白。
- Orbit 相机移动时云场保持空间连续。
- 飞车移动时云场有相对运动。
