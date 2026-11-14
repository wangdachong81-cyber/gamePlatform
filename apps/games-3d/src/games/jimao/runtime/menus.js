// Recovered from the supplied bundled game; gameplay preserved.
import { gameDocument as document, gameWindow as window, addEventListener, removeEventListener, setTimeout, clearTimeout, setInterval, clearInterval, requestAnimationFrame, cancelAnimationFrame } from '../environment.js';
import { PLAYER_CONFIG, QUALITY_PRESETS } from './settings.js';

var fM = "saltline.settings.v1", XC = { quality: "auto", sens: 1, invertY: !1, volume: .8, fov: PLAYER_CONFIG.fov }, dM = ["low", "medium", "high", "ultra"];

function YC() { let i = { ...XC }; try {
    let e = JSON.parse(localStorage.getItem(fM) || "null");
    e && typeof e == "object" && ((e.quality === "auto" || dM.includes(e.quality)) && (i.quality = e.quality), Number.isFinite(e.sens) && (i.sens = Math.min(3, Math.max(.2, e.sens))), i.invertY = !!e.invertY, Number.isFinite(e.volume) && (i.volume = Math.min(1, Math.max(0, e.volume))), Number.isFinite(e.fov) && (i.fov = Math.min(95, Math.max(60, e.fov))));
}
catch { } return i; }

function Wf(i) { try {
    localStorage.setItem(fM, JSON.stringify(i));
}
catch { } }

var $C = `
  <dl class="keys">
    <div><dt>移动</dt><dd><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></dd></div>
    <div><dt>视角</dt><dd>鼠标</dd></div>
    <div><dt>开火</dt><dd>鼠标左键</dd></div>
    <div><dt>瞄准</dt><dd>鼠标右键</dd></div>
    <div><dt>换弹</dt><dd><kbd>R</kbd></dd></div>
    <div><dt>切断中继</dt><dd>按住 <kbd>E</kbd></dd></div>
    <div><dt>跳跃</dt><dd><kbd>Space</kbd></dd></div>
    <div><dt>冲刺</dt><dd><kbd>Shift</kbd></dd></div>
    <div><dt>蹲伏</dt><dd><kbd>C</kbd> 或 <kbd>Ctrl</kbd></dd></div>
    <div><dt>近战</dt><dd><kbd>F</kbd></dd></div>
    <div><dt>暂停</dt><dd><kbd>Esc</kbd> 或 <kbd>P</kbd></dd></div>
  </dl>`, ZC = `
  <dl class="keys">
    <div><dt>移动</dt><dd>左手拇指在左侧任意位置滑动</dd></div>
    <div><dt>视角</dt><dd>在屏幕右侧拖动</dd></div>
    <div><dt>开火</dt><dd>按住“开火”，拖动跟踪目标</dd></div>
    <div><dt>瞄准</dt><dd>点击“瞄准”切换瞄准状态</dd></div>
    <div><dt>换弹</dt><dd>换弹</dd></div>
    <div><dt>跳跃</dt><dd>跳跃</dd></div>
    <div><dt>切断中继</dt><dd>靠近中继并按住“交互”</dd></div>
    <div><dt>冲刺</dt><dd>将摇杆推到最前方</dd></div>
  </dl>`;

function createMenus(i, e) {
    let t = document.getElementById("ui"), n = YC(), s = document.createElement("div");
    s.className = "menu", s.dataset.screen = "none", s.innerHTML = `
    <div class="m-veil"></div>
    <div class="m-bars"><i></i><i></i></div>

    <section class="m-screen m-title" data-s="title" aria-label="几猫">
      <div class="m-title-main">
        <div class="m-eyebrow"><span class="m-tag">B4</span><span>几猫突击小队</span><span class="m-dim">几猫港区 · 05:42</span></div>
        <h1 class="m-word">几猫<span class="m-subtitle">3A大作</span></h1>
        <p class="m-premise">港区防御系统失控。切断三处中继，突破封锁，登船撤离。</p>
        <div class="m-actions">
          <button class="btn primary" data-act="deploy">开始行动</button>
          <button class="btn" data-act="settings">设置</button>
          <button class="btn" data-act="about">项目介绍</button>
          <button class="btn m-only-narrow" data-act="controls">操作说明</button>
        </div>
        <p class="m-note">使用 Fable5.2 自主研发 · 国产第一人称射击游戏 · 开发体验版</p>
      </div>
      <aside class="m-legend" aria-label="操作速览">
        <div><span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> 移动</span><span><kbd>鼠标</kbd> 视角</span><span><kbd>左键</kbd> 开火</span><span><kbd>右键</kbd> 瞄准</span><span><kbd>R</kbd> 换弹</span></div>
        <div><span><kbd>E</kbd> 切断中继</span><span><kbd>Space</kbd> 跳跃</span><span><kbd>Shift</kbd> 冲刺</span><span><kbd>C</kbd> 蹲伏</span><span><kbd>Esc</kbd> 暂停</span></div>
        <div class="lg-touch"><em>触屏操作</em><span>左手拇指移动</span><span>右手拇指转动视角</span><span>屏幕按钮：开火 · 瞄准 · 换弹 · 跳跃</span></div>
      </aside>
    </section>

    <section class="m-screen m-card" data-s="paused" aria-label="已暂停">
      <div class="m-k">行动暂时中止</div>
      <h2 class="m-h">已暂停</h2>
      <p class="m-line" data-f="lookmode"></p>
      <div class="m-actions col">
        <button class="btn primary" data-act="resume">继续游戏</button>
        <button class="btn" data-act="settings">设置</button>
        <button class="btn" data-act="controls">操作说明</button>
        <button class="btn" data-act="restart">重新开始任务</button>
      </div>
    </section>

    <section class="m-screen m-card m-dead" data-s="dead" aria-label="信号中断">
      <div class="m-k">突击队员倒下</div>
      <h2 class="m-h">信号中断</h2>
      <dl class="m-stats"><div><dt>生存时间</dt><dd data-f="dead-time">00:00</dd></div><div><dt>已切断中继</dt><dd data-f="dead-relays">0/3</dd></div></dl>
      <div class="m-actions col"><button class="btn primary" data-act="retry">重试</button></div>
    </section>

    <section class="m-screen m-card m-debrief" data-s="complete" aria-label="行动简报">
      <div class="m-k">四号泊位 · 行动简报</div>
      <h2 class="m-h">几猫港区已解除封锁</h2>
      <div class="m-rating"><span>行动评级</span><b data-f="rating">干净利落</b></div>
      <dl class="m-stats">
        <div><dt>用时</dt><dd data-f="time">00:00</dd></div>
        <div><dt>命中率</dt><dd data-f="acc">0%</dd></div>
        <div><dt>摧毁机械</dt><dd data-f="kills">0</dd></div>
        <div><dt>重试次数</dt><dd data-f="retries">0</dd></div>
      </dl>
      <div class="m-actions col"><button class="btn primary" data-act="redeploy">再次出击</button></div>
    </section>

    <div class="panel" role="dialog" aria-modal="true" aria-label="设置与操作" tabindex="-1" hidden>
      <header class="panel-h">
        <div class="tabs" role="tablist">
          <button class="tab" role="tab" data-tab="settings" aria-selected="true">设置</button>
          <button class="tab" role="tab" data-tab="controls" aria-selected="false">操作说明</button>
        <button class="tab" role="tab" data-tab="about" aria-selected="false">项目介绍</button>
        </div>
        <button class="btn small" data-act="close-panel">关闭</button>
      </header>
      <div class="panel-b about-copy" data-pane="about" hidden>
        <h3>几猫3A大作</h3>
        <p>各位老师、同学好！宣传一下我们最近使用 Fable5.2 自主研发的一款国产 3A FPS 大作——<strong>《几猫》</strong>！🎮</p>
        <p>我们致力于打造具有中国特色的高品质第一人称射击游戏，融合沉浸式战斗体验、创新玩法与次世代视觉表现，探索国产 FPS 游戏的更多可能性。</p>
        <p>目前项目仍在持续开发与优化中，距离国际顶尖 3A 水准还有一定差距。</p>
        <p>非常欢迎各位老师、同学关注、体验并提出宝贵建议，期待与游戏开发、图形学及 AI 方向的朋友深入交流！🐱🔥</p>
      </div>
      <div class="panel-b" data-pane="settings">
        <div class="row"><label id="l-q">画面质量</label>
          <div class="seg" role="group" aria-labelledby="l-q">${dM.map(U => `<button data-q="${U}" aria-pressed="false">${({ low: "低", medium: "中", high: "高", ultra: "极高" })[U]}</button>`).join("")}</div></div>
        <div class="row"><label for="s-sens">鼠标灵敏度</label><div class="slider"><input id="s-sens" type="range" min="0.2" max="3" step="0.05"><output data-o="sens"></output></div></div>
        <div class="row"><label id="l-inv">反转垂直视角</label><button class="toggle" data-act="invert" aria-labelledby="l-inv" aria-pressed="false"><i></i><span>关闭</span></button></div>
        <div class="row"><label for="s-vol">主音量</label><div class="slider"><input id="s-vol" type="range" min="0" max="100" step="1"><output data-o="vol"></output></div></div>
        <div class="row"><label for="s-fov">视野范围</label><div class="slider"><input id="s-fov" type="range" min="60" max="95" step="1"><output data-o="fov"></output></div></div>
        <div class="row" data-row="fs"><label id="l-fs">显示模式</label><button class="btn small" data-act="fullscreen" aria-labelledby="l-fs fs-t"><span id="fs-t">进入全屏</span></button></div>
        <p class="panel-note" data-f="qnote"></p>
      </div>
      <div class="panel-b" data-pane="controls" hidden>
        <h3>键盘 · 鼠标</h3>${$C}
        <p class="panel-note">若浏览器无法捕获鼠标，按住鼠标按钮并拖动以调整视角（左键同时开火，右键同时瞄准）。方向键或 <kbd>I</kbd><kbd>J</kbd><kbd>K</kbd><kbd>L</kbd> 转向，<kbd>Enter</kbd> 开火。</p>
        <h3>触屏操作</h3>${ZC}
        <h3>手柄</h3>
        <p class="panel-note">摇杆移动与转动视角 · RT 开火 · LT 瞄准 · A 跳跃 · B 蹲伏 · X 换弹 · Y 切断中继 · L3 冲刺 · Start 暂停。</p>
      </div>
    </div>

    <div class="loc-card" aria-hidden="true"><i></i><b>几猫港区 · 四号泊位 · 05:42</b><span>几猫突击小队 · 单兵行动，无人支援</span></div>
  `, t.appendChild(s);
    let o = U => s.querySelector(U), r = U => [...s.querySelectorAll(U)], a = o(".panel"), l = o(".loc-card"), c = U => s.querySelector(`[data-f="${U}"]`), u = o("#s-sens"), h = o("#s-vol"), f = o("#s-fov"), p = "none", d = null;
    function v(U) { if ((!U || U === "sens") && (i.input.sensitivity = n.sens), (!U || U === "invertY") && (i.input.invertY = n.invertY), !U || U === "volume")
        try {
            i.audio && i.audio.setVolume && i.audio.setVolume(n.volume);
        }
        catch (T) {
            console.error(T);
        } if ((!U || U === "fov") && i.player && i.player.setFov && i.player.setFov(n.fov), U === "quality" || !U && n.quality !== "auto" && !i.params.shot && !i.params.q && n.quality !== (i.quality && i.quality.name)) {
        let T = QUALITY_PRESETS[n.quality];
        if (T)
            try {
                i.render && i.render.setQuality ? i.render.setQuality({ ...T }) : i.quality = { ...T };
            }
            catch (D) {
                console.error("[game] setQuality failed", D);
            }
    } }
    function g() { let U = n.quality === "auto" ? i.quality && i.quality.name : n.quality; for (let D of r(".seg button"))
        D.setAttribute("aria-pressed", String(D.dataset.q === U)); u.value = n.sens, h.value = Math.round(n.volume * 100), f.value = n.fov, o('[data-o="sens"]').textContent = n.sens.toFixed(2) + "\xD7", o('[data-o="vol"]').textContent = Math.round(n.volume * 100) + "%", o('[data-o="fov"]').textContent = Math.round(n.fov) + "\xB0"; let T = o('[data-act="invert"]'); T.setAttribute("aria-pressed", String(n.invertY)), T.querySelector("span").textContent = n.invertY ? "开启" : "关闭", c("qnote").textContent = n.quality === "auto" ? `已根据设备自动选择画质（${({ low: "低", medium: "中", high: "高", ultra: "极高" })[U] || "默认"}），运行不流畅时可降低画质。` : "画质设置立即生效；阴影和反射需要片刻重新生成。"; }
    u.addEventListener("input", () => { n.sens = +u.value, v("sens"), g(), Wf(n); }), h.addEventListener("input", () => { n.volume = +h.value / 100, v("volume"), g(), Wf(n); }), f.addEventListener("input", () => { n.fov = +f.value, v("fov"), g(), Wf(n); });
    let x = o('[data-row="fs"]'), y = o("#fs-t"), b = () => document.fullscreenElement || document.webkitFullscreenElement || null, m = document.getElementById("app") || document.documentElement;
    m && (m.requestFullscreen || m.webkitRequestFullscreen) && document.fullscreenEnabled !== !1 && document.webkitFullscreenEnabled !== !1 || (x.hidden = !0);
    function _() { y.textContent = "当前环境不支持全屏"; }
    function M() { try {
        if (b()) {
            (document.exitFullscreen || document.webkitExitFullscreen).call(document);
            return;
        }
        let U = (m.requestFullscreen || m.webkitRequestFullscreen).call(m);
        U && U.catch && U.catch(_);
    }
    catch {
        _();
    } }
    let E = () => { y.textContent = b() ? "退出全屏" : "进入全屏"; };
    document.addEventListener("fullscreenchange", E), document.addEventListener("webkitfullscreenchange", E);
    function w(U) { d = document.activeElement, a.hidden = !1, s.classList.add("panel-open"), z(U || "settings"); try {
        a.focus({ preventScroll: !0 });
    }
    catch { } }
    function S() { return a.hidden ? !1 : (a.hidden = !0, s.classList.remove("panel-open"), d && d.focus && s.contains(d) ? d.focus() : H(), !0); }
    function z(U) { for (let T of r(".tab"))
        T.setAttribute("aria-selected", String(T.dataset.tab === U)); for (let T of r(".panel-b"))
        T.hidden = T.dataset.pane !== U; }
    function H() { let U = s.querySelector(`.m-screen[data-s="${p}"] .btn.primary`); if (U)
        try {
            U.focus({ preventScroll: !0 });
        }
        catch { } }
    s.addEventListener("click", U => { let T = U.target.closest("button"); if (!T || !s.contains(T))
        return; if (i.events.emit("ui:click", {}), T.dataset.q) {
        n.quality = T.dataset.q, v("quality"), g(), Wf(n);
        return;
    } if (T.dataset.tab) {
        z(T.dataset.tab);
        return;
    } let D = T.dataset.act; D === "about" ? w("about") : D === "settings" ? w("settings") : D === "controls" ? w("controls") : D === "close-panel" ? S() : D === "invert" ? (n.invertY = !n.invertY, v("invertY"), g(), Wf(n)) : D === "fullscreen" ? M() : D && e[D] && e[D](U); }), s.addEventListener("mouseover", U => { let T = U.target.closest("button"); T && U.relatedTarget && !T.contains(U.relatedTarget) && i.events.emit("ui:hover", {}); }), s.addEventListener("keydown", U => { if (U.code === "Escape" && !a.hidden && (S(), U.stopPropagation(), U.preventDefault()), U.code === "Tab" && !a.hidden) {
        let T = [...a.querySelectorAll("button, input")].filter(G => G.offsetParent !== null);
        if (!T.length)
            return;
        let D = T[0], C = T[T.length - 1];
        U.shiftKey && document.activeElement === D ? (C.focus(), U.preventDefault()) : !U.shiftKey && document.activeElement === C && (D.focus(), U.preventDefault());
    } });
    let O = U => (U = Math.max(0, Math.floor(U)), String(Math.floor(U / 60)).padStart(2, "0") + ":" + String(U % 60).padStart(2, "0")), q = { root: s, settings: n, fmtTime: O, get screen() { return p; }, get panelOpen() { return !a.hidden; }, closePanel: S, show(U) { U !== p && (p = U, s.dataset.screen = U, S(), s.classList.toggle("open", U !== "none"), U !== "none" ? (g(), setTimeout(H, 30)) : document.activeElement && s.contains(document.activeElement) && document.activeElement.blur()); }, locationCard(U) { l.classList.toggle("on", !!U); }, setLookMode(U) { c("lookmode").textContent = U || ""; }, setDead({ time: U, relays: T, total: D }) { c("dead-time").textContent = O(U), c("dead-relays").textContent = `${T}/${D}`; }, setDebrief({ time: U, accuracy: T, kills: D, retries: C, rating: G }) { c("time").textContent = O(U), c("acc").textContent = T == null ? "\u2014" : Math.round(T * 100) + "%", c("kills").textContent = String(D), c("retries").textContent = String(C), c("rating").textContent = G; }, applySettings: v };
    return g(), q;
}

export { fM, XC, dM, YC, Wf, $C, ZC, createMenus };
