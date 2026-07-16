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
4. ⚡ 初版曾在首帧与节流周期采集完整渲染快照；该自动策略已于 2026-07-15 废止，当前只允许手动触发。
5. 🆕 暴露 `window.__shaderRoamDebug.dump()`，供 Chrome DevTools 主动抓取即时快照。
6. 🆕 构建后在正常 Chrome WebGL 环境采集 console，依据证据定位云层消失阶段。

## 云层正常模式可读性修复（2026-07-16）

### 运行态证据

- 🆕 正常模式画面只呈现近场云丝和橙色天空，块状体积云没有可辨识轮廓。
- 🆕 运行快照确认 `SunsetSkyMaterial` 已链接并持续完成 draw；相机高度约为 `523`，位于 `120-1160` 云层内，中心视线命中约 `2055` 单位的云层交段。
- 🆕 调试模式 `1` 显示天空视线正常命中云层，模式 `2` 显示清晰的积分透明度云团，因此问题不在模块接线、交段或 density 生成，而在正常 RGB 着色阶段。
- 🆕 当前 low 光照主要由层内高度和太阳夹角决定，云体内部不同 density 得到接近的暖橙色；它与落日背景色过近，透明度轮廓被颜色同化。

### 修复计划

1. 🆕 保持 `12` 步、3 层 fBM、采样距离和 density/coverage 参数不变，避免把可读性修复误做成性能或云量调整。
2. 🆕 在既有样本上加入 density core shadow，让高密度云体比薄边更暗，不增加 low 档噪声采样。
3. 🆕 拉开冷色阴影与暖色受光面的色相和明度差，同时保留日落方向的银边。
4. 🆕 构建后对比正常模式、云层交段模式和积分透明度模式，并检查浏览器 shader 链接与错误日志。

### 实际落地与验证

- ⚡ shader 版本更新为 `sunset-sky-2026-07-16.2`；density、coverage、云层高度、最远距离和 low `12` 步预算保持不变。
- 🆕 密度配置增加 `coreShadowStart: 0.18`、`coreShadowEnd: 0.72` 与 `coreShadowStrength: 0.32`，高密度样本会在既有光照结果上获得更深的核心阴影。
- ⚡ low 光照改为层内高度、平方后的视线/太阳夹角与 core shadow 共同决定；没有增加噪声或二次 density 采样。
- ⚡ 云影从接近背景的紫橙色调整为更冷更暗的紫色，受光面保留暖金色；银边随 core shadow 减弱，避免厚云内部整体发亮。
- 🆕 代表性落日背景离线复算中，density `0.6-0.8` 的颜色距离从约 `0.113` 提升到 `0.276-0.298`；density `0.2` 的薄边保持为 `0.132`，不会把整层云统一压黑。
- 🆕 `npm run build` 通过，Vite 转换 `27` 个模块，生产入口约 `696.82 kB`；仅保留既有的单包体积提示，`git diff --check` 通过。
- ⚡ 修复前已用运行态调试模式确认交段与积分透明度；修改后的 localhost 自动重载/截图被浏览器 URL 安全策略阻止，未绕过策略，最终正常模式视觉验收仍需在现有 Chrome 页面刷新后确认。

## 周期性卡顿修复计划（2026-07-15）

### 根因证据

- 🆕 修复前的 `Experience` 每 5 秒执行一次完整诊断，连续调用 5 次 `gl.readPixels`，同时查询 WebGL program 并输出大型 console 快照；GPU 到 CPU 的同步回读与用户观察到的固定周期卡顿一致。
- 🆕 修复前的 `SunsetEnvironment` 每 300 帧创建并输出 before/after draw 日志对象，在 60 FPS 下同样约为 5 秒周期。
- 🆕 修复前的 HUD 每帧通过 `replaceChildren` 重建三个文本节点，产生不必要的 DOM 更新和短生命周期对象，可能放大周期垃圾回收抖动。

### 修复方案

1. 🆕 从 animation loop 删除自动首帧/5 秒完整诊断，保留 `window.__shaderRoamDebug.dump()` 和 `snapshot()` 手动入口。
2. 🆕 draw callback 只在最初两帧输出初始化证据，之后只递增计数器。
3. 🆕 HUD 限频并按显示值去重，只在文本真正变化时修改 DOM。
4. 🆕 用构建、静态检索和浏览器持续运行检查确认不再存在周期回读路径。

### 实际落地

- ⚡ 删除 `Experience.tick()` 内的首帧及每 5 秒自动诊断分支；正常 `requestAnimationFrame` 路径不再调用 `readFramebufferPixelSamples()`、program introspection 或完整 snapshot 日志。
- ⚡ `window.__shaderRoamDebug.dump()` 仍保留帧缓冲采样与 console 输出，`snapshot()` 仍保留无帧缓冲的即时状态，昂贵诊断只在开发者主动调用时执行。
- ⚡ sky before/after draw callback 只在前两次 draw 输出初始化证据，之后仅递增诊断计数器，不再每 300 帧创建日志对象。
- 🆕 HUD 更新频率限制为 10 Hz，速度和高度按显示字符串去重；固定环境标签只在构造阶段写入一次。
- ⚡ 诊断版本更新为 `sunset-render-console-2026-07-15.1`。

## low 稳帧预算决策（2026-07-16）

### 决策

1. 🆕 `low` 的职责是作为优先保帧的最低质量档，`CLOUD_MARCH_STEPS` 从修改前源码中的 `16` 调整为 `12`。
2. 🆕 相对 `16` 步，`12` 步最多减少 `25%` raymarch 循环次数，单步采样距离增加约 `33%`。
3. 🆕 保留 `3` 层 fBM、`3200` 最远采样距离并继续关闭太阳方向二次密度采样，本轮不改变云层密度语义。
4. 🆕 Beer-Lambert 消光按步长计算，因此平均不透明度不应随步数线性降低；主要风险是薄云漏采样、轮廓粗化和运动时的时域颗粒。
5. 🆕 降到 `12` 步不构成稳定帧率保证；后续仍需以云层独立分辨率、帧时滞回和最低档固定 `30 FPS` 降级作为完整稳帧策略。

### 本轮验收

- 源码、shader 编译日志和架构/开发文档中的 low 步数必须一致为 `12`。
- `npm run build` 通过，浏览器无 shader 编译、链接或 WebGL 运行错误。
- 复测 `1920 × 1080` 帧时，并与 `16` 步的 `12` 秒基线对比。
- 检查落日云层仍存在透明空隙、局部云体和可读轮廓。

### 实际落地与验证

- ⚡ `sunsetSkyQualityDefines.low.CLOUD_MARCH_STEPS` 已从 `16` 改为 `12`，shader 版本更新为 `sunset-sky-2026-07-16.1`。
- 🆕 `npm run build` 通过：Vite 转换 `27` 个模块，生产入口约 `696.23 kB`，仅保留既有的单包体积提示。
- 🆕 浏览器运行态确认 shader 版本为 `sunset-sky-2026-07-16.1`，low defines 为 `12 / 3 / 3200 / 无二次密度光照`。
- 🆕 `1920 × 1080` 、12 秒复测共采样 `720` 帧：平均 `16.67 ms`、P95 `17.6 ms`、P99 `17.7 ms`、最大 `17.8 ms`，超过 `25 ms` 的帧为 `0`。
- 🆕 对比同分辨率的 `16` 步基线：平均帧时从 `21.16 ms` 降至 `16.67 ms`，约 `33.4 ms` 的超预算帧从 `153 / 567` 降至 `0 / 720`。
- 🆕 帧时复测期间城市区块回收 `4` 次，未出现长帧；页面 error/warn 日志为空。
- 🆕 实际画面仍保留透明天空空隙、分散云体与可读轮廓；本轮未新增归档截图。

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
- ⚡ 修复“只有太阳和天空、看不到云”的可见性问题：low 当前使用 `12` 步预算，归一化 fBM，使用稀疏 coverage / billow 密度和步长稳定的 Beer-Lambert 消光。
- 🆕 新增 `src/diagnostics/renderDiagnostics.ts`：记录 GPU 能力、shader 链接错误、renderer program、draw call 和少量帧缓冲像素。
- ⚡ `SunsetEnvironment` 保留 init/resize/update/compile/draw 分阶段日志，并校验相机 uniform、天空球中心和中心视线云层交段。
- ⚡ `Experience` 不再自动输出首帧或周期快照；完整 console 快照只允许通过手动 debug API 触发，避免诊断回读阻塞渲染。
- ⚡ 调试 API 为 `window.__shaderRoamDebug.dump()` / `snapshot()` / `setAtmosphereDebugMode()`。
- 🆕 shader 增加默认关闭的交段视图（模式 `1`）和积分透明度视图（模式 `2`）；模式 `0` 保持正常渲染。

## 验证记录

- ⚡ `npm run build` 通过。
- ⚡ dev server 返回新 shader，确认包含 `cloudDensity`、`marchClouds`、`CLOUD_MARCH_STEPS`。
- ⚡ dev server 返回相机实现，确认只保留 `OrbitCameraRig`，鼠标固定交给 orbit 视角。
- ⚡ Vite 日志确认旧问题为 shader 编译失败：`uCameraPosition` 未声明；修复后构建通过，dev server 返回新 shader。
- ⚡ 当前自动浏览器/Chrome 插件不可用；本地无头 Chrome 环境禁用 WebGL，只能确认无 TypeScript/Vite 构建错误，页面视觉需在正常浏览器中复核。
- ⚡ 2026-07-16 对齐稳帧预算：将 low 的实际 raymarch 从 `16` 步降到 `12` 步，继续关闭 low/medium 的太阳方向二次密度采样，并完成构建与 `1080p` 帧时复测。
- ⚡ 2026-07-10 复核云层不可见：确认 sky sphere shader 在运行；上一轮“density/alpha 太保守”的判断在增益调整后已不成立，实际问题变为 density/alpha 饱和。
- 🆕 2026-07-10：`npm run build` 通过，Vite `http://127.0.0.1:5173` 返回诊断版本 `cloud-render-console-2026-07-10.1` 与最新 shader。
- 🆕 2026-07-10：Chrome、ChatGPT Chrome Extension 与 native host 只读检查均正常，但浏览器控制端尚未发现可用会话；实际 WebGL console 采集等待打开插件绑定的 Chrome 窗口后继续。
- 🆕 2026-07-10：用户授权后调用插件窗口启动脚本，macOS 返回 `kLSNoExecutableErr`（`/Applications/Google Chrome.app` 无法启动新实例）；等待 2 秒后的唯一一次扩展重试仍返回 `Browser is not available: extension`。需要从 ChatGPT 插件界面重新安装 Chrome 插件后再采集 DevTools console。
- 🆕 2026-07-10：用户重新安装 Chrome 插件后复测，扩展启用状态与 native host 仍全部通过，但窗口启动继续返回同一 `kLSNoExecutableErr`，扩展会话仍为空。扩展重装已排除，下一步需要修复或重新安装 `/Applications/Google Chrome.app` 后再连接。
- ⚡ 2026-07-10：`cloud-sky-2026-07-10.2` 修复后 `npm run build` 通过；开发服务器与生产 bundle 均包含归一化密度配置和 Beer-Lambert 消光。
- ⚡ 2026-07-10：离线数值回归确认默认视角不再全屏饱和；浏览器控制端仍无可用会话，未生成 WebGL 截图，需在正常 Chrome 中完成最终视觉验收。
- 🆕 2026-07-10：落日主题迁移后 `npm run build` 通过，Vite 转换 24 个模块；开发服务器返回 `sunset-sky-2026-07-10.1`。
- 🆕 2026-07-10：浏览器控制端列表仍为空，无法完成截图和 canvas 像素验收；资源、构建和 shader 源码检查已通过。
- 🆕 2026-07-15：周期性卡顿修复后 `npm run build` 通过，Vite 转换 25 个模块；入口包约 `675.24 kB`，仅保留既有的 500 kB 体积提示。
- 🆕 2026-07-15：静态检索确认 5 秒诊断条件、`periodic-render-health` 和 300 帧 draw 日志均已移除；`readFramebufferPixelSamples` 仅由手动 `dumpDiagnostics()` 调用。
- 🆕 2026-07-15：in-app Browser 可用会话列表为空，无法采集持续帧时间；本轮已完成构建与调用路径验证，真实设备的长时间体感仍需复核。

## 验证项

- `npm run build` 通过。
- shader 不依赖外部 Shadertoy texture。
- 页面显示落日天空、低角度太阳和体积云。
- 正常模式同时存在清晰天空空隙、局部半透明云和高密度云体，不应全屏接近同一颜色。
- 调试模式 `2` 的探针不应全部接近纯黑或纯白。
- Orbit 相机移动时云场保持空间连续。
- 飞车移动时云场有相对运动。
