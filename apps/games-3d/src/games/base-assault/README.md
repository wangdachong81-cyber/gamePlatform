# 纵深突击

Three.js 第一人称街机射击关卡，玩法采用纵向基地突破：清守卫 → 打核心 → 闸门开启 → 向前过门 → 补给并升级散弹。共三个常规房间和一个三弱点机械 Boss 房间。使用原创程序化几何和合成音效，无外部模型、贴图或音频。

- `model.ts`：伤害、核心护盾、关卡推进和通关状态。
- `engine.ts`：场景、碰撞、射线命中、可躲避弹丸、视角、音效与清理。
- `index.tsx` / `style.css`：菜单、HUD、触屏控件与平台 SDK。
- `model.test.ts`：护盾规则、回血升级、通关、暂停与死亡测试。

WASD 移动；鼠标瞄准；左键或空格连续开火；Shift 加速；ESC 暂停；R 重开；M 静音。无法捕获鼠标时可拖动画面或用方向键瞄准。触屏使用左侧方向按钮、拖动画面和右侧开火按钮。

主页「3D 新宇宙」中打开；独立路由 `/games-3d/#/games/base-assault`。

验证：`node --experimental-strip-types --test apps/games-3d/src/games/base-assault/model.test.ts`；`npm run test:e2e -- tests/base-assault.spec.ts`。
