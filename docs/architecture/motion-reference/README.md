# 程序化运动参照系统原理文档

## 1. 架构设计

```mermaid
graph TB
    %% 🆕 新增  ⚡ 修改
    VehicleState[VehicleState] --> MotionField[🆕 MotionReferenceField]
    Camera[Orbit Camera] --> MotionField
    Quality[Quality Level] --> MotionField

    MotionField --> NearFlow[🆕 Near Flow<br/>Cloud Wisps + Light Motes]
    MotionField --> MidField[⚡ Mid Field<br/>Paired Guide Markers]
    MotionField --> FarField[🆕 Far Field<br/>City Silhouette]

    VehicleState --> CameraRig[⚡ OrbitCameraRig]
    CameraRig --> FollowSpring[🆕 Follow Lag + Look Ahead]
    CameraRig --> DynamicFov[🆕 Speed FOV]

    NearFlow --> Renderer[WebGLRenderer]
    MidField --> Renderer
    FarField --> Renderer
    FollowSpring --> Renderer
    DynamicFov --> Renderer
```

## 2. 模块设计

| 模块 | 职责 | 输入 | 输出 |
|------|------|------|------|
| `MotionReferenceField` | 🆕 统一管理程序化参照物的创建、更新、回收和诊断 | `VehicleState`、相机、质量档、时间步 | 近中远三层世界参照 |
| `NearFlow` | 🆕 以固定对象池生成快速掠过的薄云丝和光点 | 载具位置、速度、朝向 | 高频周边光流 |
| `RouteField` | ⚡ 沿前进走廊循环布置成对发光短条 | 载具位置、旅行坐标系、确定性种子 | 中景尺度与路径参照 |
| `CitySilhouette` | 🆕 用实例化建筑形成低成本远景轮廓 | 载具位置、世界高度、旅行坐标系 | 远景方向和高度参照 |
| `OrbitCameraRig` | ⚡ 保留自由 orbit，同时增加跟随惯性、前视和速度 FOV | `VehicleState`、用户 orbit 输入 | 有加减速反馈的相机变换 |

## 3. 核心原理

- 🆕 运动感来自不同距离参照物产生的视差，而不是让天空背景整体播放更快。
- 🆕 近景、中景、远景分别承担速度、空间位移和方向尺度；任一层都不能代替另外两层。
- 🆕 高频重复元素使用 `Points` / `InstancedMesh` / 程序化材质，不为云丝、光点、航道和剪影引入 GLB。
- 🆕 所有参照物数量有固定上限；跨越回收边界后在前方重新布置，运行时不持续创建场景对象。
- 🆕 中远景在被回收前保持稳定世界位置；越过后方、距离上限或方向失效边界后，才使用确定性随机序列重新布置到前方。
- ⚡ 航道换向采用两阶段回收：先标记全部失效实例，只从有效实例计算最远前方游标；批量失效时从有界基础距离重新铺设，避免旧方向实例把生成距离持续推远。
- 🆕 近场对象池允许围绕载具维护，但对象必须表现出与 `VehicleState.velocity` 相反的相对运动，不能静止绑定相机。
- ⚡ 航道只由左右成对的发光短条构成，是视觉参照而非实体道路；不包含椭圆门、碰撞或路径约束。
- ⚡ 中景程序化云柱已移除：半透明云片纵向叠加会形成深色烟柱轮廓，并与 `SunsetEnvironment` 的体积云职责重复。
- ⚡ 云层外观统一由落日体积云负责；运动参照模块只保留低密度近场云丝，不再生成可聚成块的局部云体。
- ⚡ 相机只对自动跟随位移施加平滑和前视，用户通过 `OrbitControls` 产生的旋转、缩放和平移仍然保留。
- ⚡ 相机同步平滑跟随飞车水平航向，使近中远参照物的光流方向与屏幕转向反馈保持一致，同时不继承视觉侧倾。
- 🆕 FOV 由速度归一化结果平滑驱动；加速增强速度感，减速后恢复，避免瞬时跳变。

## 4. 核心数据结构

```typescript
interface MotionReferenceSettings {
  moteCount: number
  wispCount: number
  markerPairCount: number
  buildingCount: number
}

interface MotionReferenceDiagnostics {
  version: string
  initialized: boolean
  speedRatio: number
  recycleCount: number
  counts: {
    near: number
    mid: number
    far: number
  }
  routeAnchor: [number, number, number] | null
}

interface CameraMotionFeedback {
  initialized: boolean
  lookAheadDistance: number
  targetFov: number
  currentFov: number
  targetHeading: number
  followHeading: number
  headingError: number
}
```

## 5. 业务流程

```mermaid
sequenceDiagram
    participant Experience
    participant Vehicle
    participant Motion as MotionReferenceField
    participant Camera as OrbitCameraRig
    participant Renderer

    Experience->>Vehicle: update(dt)
    Vehicle-->>Motion: position / velocity / rotation / speed
    Motion->>Motion: 更新近场相对位移并回收越界实例
    Motion->>Motion: 越过回收边界后将航道和城市剪影布置到前方
    Vehicle-->>Camera: VehicleState
    Camera->>Camera: 平滑跟随、速度前视和 FOV
    Motion-->>Renderer: 分层程序化参照物
    Camera-->>Renderer: 当前观察矩阵
    Renderer->>Renderer: 合成飞车、参照物和落日天空
```

## 6. 核心伪代码

```text
function 更新运动参照(dt, vehicleState):
    1. 计算载具当前前向、右向和速度比例
    2. 让近场云丝与光点按相对速度穿过观察空间
    3. 越过后方或横向边界的实例重新生成到载具前方
    4. 批量标记越过后方、距离或方向边界的航道与城市实例
    5. 排除失效实例后计算有界前方游标，并将失效实例重新铺到前方
    6. 更新实例矩阵和材质中的时间、速度参数

function 更新运动相机(dt, vehicleState):
    1. 将自动跟随目标设为载具位置、车身高度偏移和速度方向前视
    2. 用帧率无关阻尼计算自动目标位移
    3. 将相同位移应用于 OrbitControls target 和 camera
    4. 按最短角度平滑跟随水平航向并旋转当前相机偏移
    5. 保留用户当前 orbit 相对构图
    6. 按速度平滑更新 FOV
```
