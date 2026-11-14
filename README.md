# 游隙 · 网页游戏平台

一个主平台 + 两个独立游戏子平台，使用 npm workspaces 管理。

| 应用 | 技术栈 | 开发地址 |
| --- | --- | --- |
| `apps/portal` | Vue 3、Wujie、GSAP | http://127.0.0.1:5173 |
| `apps/games-2d` | React、Phaser | http://127.0.0.1:5174/games-2d/ |
| `apps/games-3d` | React、Babylon.js | http://127.0.0.1:5175/games-3d/ |

共享模块：`packages/contracts` 定义配置校验和通信类型，`packages/game-sdk` 提供游戏就绪、成绩上报和平台命令订阅。

## 启动

要求 Node.js 22.12+（建议 Node.js 24）。在仓库根目录执行：

```sh
npm install
npm run dev
```

打开 http://127.0.0.1:5173 。切换 2D / 3D Tab 会通过 GSAP 渐变整站主题，切换选择保留在 URL 的 `world` 参数中。页面支持键盘操作、窄屏布局和减少动态效果的系统偏好。

每个子平台可独立访问。平台开发服务器代理 `/games-2d/`、`/games-3d/`，保持统一入口；无需手动创建 iframe。

## 游戏目录

编辑 `apps/portal/public/config/games.json`，主平台运行时加载此文件：

- `apps` 定义子平台入口及其 `dimension`。
- `games[].appId` 关联子平台；`id` 同时决定子平台路由 `#/games/:id`。
- `name`、`description`、`icon`、`category`、`tags` 控制展示。
- `openMode: embedded` 通过 Wujie 加载；`new-tab` 在用户点击时打开独立页面。
- `enabled` 控制展示，`sort` 控制排序，`status` 区分 `playable` 和 `coming-soon`。
- 新增配置前，必须先在子平台的 `src/registry.ts` 注册对应游戏模块。配置不会自动生成游戏。

当前提供三个可玩原型：2D「星星收集员」、3D「浮空晶境」和 3D「霓虹疾驰」，以及从用户提供的文件迁移的 Three.js 游戏「几猫国产3A大作」。几猫通过新标签页独立运行，源代码位于 `apps/games-3d/src/games/jimao/`。其他卡片明确标记为筹备中，不能启动。

「霓虹疾驰」是单关三圈计时赛，代码位于 `apps/games-3d/src/games/neon-racer/`：

- `track.ts` 用闭合 Catmull-Rom 样条生成中心线，程序化产出路面、霓虹护栏、路灯、起跑门和城市天际线，并提供最近点、弧长采样与曲率查询。
- `car.ts` 用方块加顶点形变拼出低多边形赛车，供三台 AI 对手使用，含车轮转向、轮速、尾翼、灯组与氮气焰。
- `player-car.ts` 是玩家专属赛车，纯程序化生成、不依赖任何外部模型或贴图：沿 Z 放样六边形截面得到楔形车身与泡泡座舱，另有独立车门分块（门缝 / 门板 / 把手 / 斜向特征线）、贴车身的发光轮眉、五辐发光轮毂、尾翼与后扩散器。同材质的零件合并成单个网格，整车只产生十几个 mesh。
- `audio.ts` 用 WebAudio 合成引擎、风噪和倒计时提示音，不依赖音频资源。
- `physics.ts` 是零渲染依赖的街机车辆运动学（油门 / 刹车 / 转向 / 氮气 / 出界与撞墙减速），可脱离浏览器独立仿真调参。
- `index.tsx` 负责固定步长主循环、追尾相机、三台 AI 对手、圈速与名次结算，以及平台 `pause` / `resume` / `restart` 指令。
- 坐标约定：车模型车头朝本地 +Z，Babylon `rotation.y = heading` 对应前向量 `(sin h, cos h)`，因此沿赛道切线行驶时 `heading = atan2(tx, tz)`；屏幕右为 +X，右键使 heading 增大。全工程只认这一套，不要写成 `atan2(-tx, tz)`。
- 换车模时的硬契约：必须返回 `CarRig`（`root` / `wheels[{pivot, spinner, front}]` / `flames` / `glow` / `body`）；原点在地面中心、车长约 4.4m、轮心 `(±0.94, 0.42, +1.42 / -1.38)`、轮半径 0.41（`spin` 按 `speed*dt/0.41` 累加，改轮径会让轮子视觉打滑）、轮轴沿 X（`spinner.rotation.x` 滚动、`pivot.rotation.y` 转向）。改几何可以，改这些数不行。

操作：方向键或 WASD 驾驶，Shift 氮气，R 重开，M 静音。

## 开发新游戏

1. 在对应子平台的 `src/games/<game-id>/` 下创建游戏组件，在 `src/registry.ts` 中懒加载注册。
2. 使用 `createGameClient(gameId)`：资源和场景就绪后调用 `ready()`，成绩变化调用 `score()`；订阅 `pause`、`resume`、`restart`。
3. React effect 卸载时取消订阅并销毁引擎，3D 游戏还需释放场景和 GPU 资源。
4. 在游戏目录添加配置和图标。发布子平台后发布 JSON 即可上架。

游戏只在选中后加载引擎和资源。子平台通过 `mountGameApplication` 接入无界生命周期，卸载时调用 React root 的 `unmount`，触发引擎资源清理。主平台退出运行页会销毁 Wujie 实例；默认不保活、不预执行游戏。

## 校验与构建

```sh
npm run typecheck
npm run build
npm run preview
```

`build` 输出完整静态站点到根目录 `dist/`，包含两个子平台的构建产物。`preview` 在 http://127.0.0.1:4173 预览。主平台和游戏使用 Hash 路由，静态服务无需配置路由回退。

集成测试：首次执行 `npx playwright install chromium`，然后 `npm run test:e2e`，验证主题切换、两个引擎内嵌运行、暂停重开、卸载重进、新标签页和移动端搜索。

生产部署可以整体托管 `dist/`，也可以独立发布三个应用并通过网关映射路径。改用独立域名时修改子平台的 Vite `base` 和 JSON 入口，并为游戏资源配置允许主平台来源的 CORS。

目前是前端基础工程，收藏、账号、云存档和排行榜后端尚未实现。
