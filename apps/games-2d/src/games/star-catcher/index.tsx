import { useEffect, useRef, useState } from 'react';
import Phaser from 'phaser';
import { createGameClient } from '@youxi/game-sdk';

export default function StarCatcher() {
  const container = useRef<HTMLDivElement>(null);
  const [score, setScore] = useState(0);
  const [error, setError] = useState('');
  useEffect(() => {
    const client = createGameClient('star-catcher');
    let paused = false;
    let total = 0;
    let unsubscribe = () => {};
    class GameScene extends Phaser.Scene {
      player!: Phaser.GameObjects.Rectangle;
      star!: Phaser.GameObjects.Star;
      cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
      keys!: Record<string, Phaser.Input.Keyboard.Key>;
      create() {
        const { width, height } = this.scale;
        const grid = this.add.graphics({ lineStyle: { color: 0x294337, width: 1, alpha: .4 } });
        for (let x = 0; x < width; x += 40) grid.lineBetween(x, 0, x, height);
        for (let y = 0; y < height; y += 40) grid.lineBetween(0, y, width, y);
        this.player = this.add.rectangle(width / 2, height / 2, 30, 30, 0xd4f68a).setStrokeStyle(2, 0xf1ffda);
        this.star = this.add.star(100, 100, 5, 9, 19, 0xf2b873);
        this.placeStar();
        this.cursors = this.input.keyboard!.createCursorKeys();
        this.keys = this.input.keyboard!.addKeys('W,A,S,D') as Record<string, Phaser.Input.Keyboard.Key>;
        this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
          if (pointer.isDown && !paused) this.player.setPosition(Phaser.Math.Clamp(pointer.x, 18, width - 18), Phaser.Math.Clamp(pointer.y, 18, height - 18));
        });
        unsubscribe = client.onCommand(command => {
          if (command === 'pause') paused = true;
          if (command === 'resume') paused = false;
          if (command === 'restart') { total = 0; paused = false; setScore(0); this.player.setPosition(width / 2, height / 2); this.placeStar(); client.score(0); }
        });
        client.ready();
      }
      placeStar() { this.star.setPosition(Phaser.Math.Between(35, this.scale.width - 35), Phaser.Math.Between(35, this.scale.height - 35)); }
      update(_time: number, delta: number) {
        if (paused || !this.player) return;
        const step = 280 * Math.min(delta, 50) / 1000;
        if (this.cursors.left.isDown || this.keys.A.isDown) this.player.x -= step;
        if (this.cursors.right.isDown || this.keys.D.isDown) this.player.x += step;
        if (this.cursors.up.isDown || this.keys.W.isDown) this.player.y -= step;
        if (this.cursors.down.isDown || this.keys.S.isDown) this.player.y += step;
        this.player.x = Phaser.Math.Clamp(this.player.x, 18, this.scale.width - 18);
        this.player.y = Phaser.Math.Clamp(this.player.y, 18, this.scale.height - 18);
        this.star.rotation += .0015 * delta;
        if (Phaser.Math.Distance.Between(this.player.x, this.player.y, this.star.x, this.star.y) < 32) {
          total += 10; setScore(total); client.score(total); this.placeStar();
        }
      }
    }
    let instance: Phaser.Game | undefined;
    try {
      instance = new Phaser.Game({ type: Phaser.AUTO, parent: container.current!, width: 960, height: 540, backgroundColor: '#10231e', scene: GameScene, scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH }, audio: { noAudio: true }, input: { activePointers: 2 } });
    } catch (cause) { const message = cause instanceof Error ? cause.message : '2D 引擎启动失败'; setError(message); client.error(message); }
    return () => { unsubscribe(); instance?.destroy(true); };
  }, []);
  return <div className="game-shell"><header className="game-hud"><span>✦ 星星收集员 <small>PHASER / 2D</small></span><strong>{score} 分</strong></header>{error ? <p role="alert">{error}</p> : <div ref={container} className="engine-stage"/>}<footer className="game-instructions">方向键 / WASD 移动 · 触屏拖动 · 每颗星星 +10 分</footer></div>;
}
