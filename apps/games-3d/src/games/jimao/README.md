# 几猫国产3A大作

由用户提供的 `几猫国产3A大作_V1.html` 迁移，保留港区场景、步枪、敌人、任务、音频、触屏操作和菜单。

- `index.tsx`：React 挂载、平台 SDK、退出清理。
- `markup.html` / `game.css`：启动界面与游戏视觉，放在 Shadow DOM 内避免污染其他游戏。
- `environment.js`：限定 DOM 查询范围，管理全局事件、定时器和音频上下文。
- `runtime/`：按职责拆分的游戏逻辑：渲染、材质、道具、关卡、背景、地面、特效、音频、输入、玩家、战斗、武器、敌人、HUD、菜单与任务。

原文件中内联的 Three.js 已移除，改为 npm 依赖 `three@0.180.0`，与原文件的 r180 一致。源文件没有 source map，一些内部局部变量保留打包后的名字；核心模块入口和 Three.js 类型已恢复语义名称。

独立路由：`/games-3d/#/games/jimao`。游戏目录配置 `openMode: new-tab`，主平台点击卡片时使用 `window.open` 打开。

保留原游戏 URL 查询参数，例如 `?q=low` 低画质、`?noaudio=1` 静音、`?seed=4207` 固定随机种子。参数位于 `#` 之前。
