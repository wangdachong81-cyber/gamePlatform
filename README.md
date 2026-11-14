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

当前提供两个可玩接入原型：2D「星星收集员」和 3D「浮空晶境」，以及从用户提供的文件迁移的 Three.js 游戏「几猫国产3A大作」。几猫通过新标签页独立运行，源代码位于 `apps/games-3d/src/games/jimao/`。其他卡片明确标记为筹备中，不能启动。

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
