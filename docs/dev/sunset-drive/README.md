# 落日飞车场景开发文档

## 目标

🆕 将当前通用云层飞行场景升级为“落日飞车”：使用用户提供的 Toyota Corolla AE86 Trueno GLB，保留 arcade 六自由度控制与 orbit 观察方式，并把 shader、环境光、HUD 和诊断命名统一到落日主题。

## 资源约定

- 🆕 目标路径：`public/models/vehicles/toyota-ae86/toyota-ae86-trueno.glb`。
- 🆕 运行 URL：`/models/vehicles/toyota-ae86/toyota-ae86-trueno.glb`。
- 🆕 模型为自包含 GLB，使用 `KHR_materials_specular` / `KHR_materials_emissive_strength`，无需 Draco 或外部贴图。
- 🆕 内嵌元数据声明作者 `Lexyc16`、许可 `CC-BY-4.0`；归属文件与模型同目录交付。

## 实施计划

1. 🆕 将 AE86 移入车型分层目录，并补充 attribution。
2. 🆕 扩展 `ExperienceConfig`，加入环境显示名和模型 URL。
3. 🆕 将占位飞行器改为占位飞车；使用稳定根节点异步替换为 GLB。
4. 🆕 在 `loadVehicleModel` 中按包围盒规范化模型长度与中心。
5. 🆕 将载具控制器重命名为 `ArcadeFlyingCar`，保留现有飞行手感。
6. 🆕 将云端环境与 shader 迁移为 `SunsetEnvironment` / `sunsetSky`，更新落日配色、太阳方向、雾和灯光。
7. 🆕 更新 HUD、页面标题、调试 API 和 console 诊断命名。
8. 🆕 完成构建、资源响应、模型加载和 WebGL 视觉验收。

## 实际落地

- ⚡ 模型已迁移至约定目录，并新增同目录 `ATTRIBUTION.md`。
- ⚡ `ExperienceConfig` 已加入 `environmentLabel` 与 `vehicleModelUrl`；默认环境/载具为 `sunset-drive` / `toyota-ae86-trueno`。
- ⚡ `ExperienceConfig.vehicleModelYawDegrees` 设置为 `135`；占位飞车与 AE86 使用相同的本地 Y 轴视觉旋转，替换时不会跳角度。
- ⚡ `Experience` 使用稳定 `Group` 作为运动根节点，加载期显示 `createPlaceholderFlyingCar`，AE86 成功后只替换视觉子节点。
- ⚡ `loadVehicleModel` 将 Three.js 场景包围盒约 `4.238 x 2.891 x 9.656` 按长轴规范化为约 `2.282 x 1.557 x 5.2`，并将包围盒中心移动到原点。
- ⚡ 载具控制器、环境与 shader 已迁移为 `ArcadeFlyingCar`、`SunsetEnvironment`、`sunsetSky`。
- ⚡ 页面标题、ARIA、HUD、清屏色、console 前缀、诊断快照和 debug API 已统一到落日主题。
- ⚡ 时间源更新为 `THREE.Timer`，不再产生 `THREE.Clock` 弃用警告。
- ⚡ 默认相机 target/offset 调整为 `(0, 0.35, 0)` / `(0, 2.7, 13.5)`；估算日盘首屏位置约为 `(0.664, 0.828)`。

## 验证记录

- ⚡ `npm run build` 通过，Vite 转换 24 个模块。
- ⚡ `/models/vehicles/toyota-ae86/toyota-ae86-trueno.glb` 返回 `200 OK`、`model/gltf-binary`，长度 `1604336` 字节。
- ⚡ 项目 `GLTFLoader` 实际解析成功：28 个 mesh、0 个动画；`loadVehicleModel` 输出中心误差小于浮点精度。
- ⚡ 角度回归确认模型根节点 Y 旋转为 `2.35619449` 弧度（`135°`），元数据同步记录 `yawDegrees: 135`；旋转后中心仍为原点。
- ⚡ 开发服务器返回 `sunset-sky-2026-07-10.1` 和 `sunset-render-console-2026-07-10.1`。
- ⚡ 源码中已无 `CloudEnvironment`、`cloudSky`、`ArcadeAircraft`、`placeholder-jet` 和旧 debug API 引用。
- ⚡ 浏览器控制端当前没有可用会话，未能执行 WebGL 截图、canvas 像素检查和真实 GLB 朝向目测。

## 主题验收

- 首屏明确显示 AE86 飞车，而不是占位飞机。当前需浏览器目测确认。
- 天空具有暖色地平线、低角度太阳、冷色高空和紫红云影。当前需浏览器目测确认。
- 模型尺寸已规范化并应用 `+135°` 视觉 yaw；最终车头观感仍需浏览器目测确认。
- GLB 加载失败时保留飞车占位模型，动画循环不崩溃。
- HUD 使用短标签 `SUNSET`，在移动端不溢出。
- `npm run build` 通过，模型 URL 返回 `200`。
