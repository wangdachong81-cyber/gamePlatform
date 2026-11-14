/** 极简合成音效：引擎、风噪、氮气与倒计时提示音，不依赖任何音频资源。 */
export interface EngineAudio {
  unlock: () => void;
  update: (speedRatio: number, throttle: number, boosting: boolean, offroad: boolean) => void;
  beep: (frequency: number, duration: number) => void;
  setMuted: (muted: boolean) => void;
  dispose: () => void;
}

export function createEngineAudio(): EngineAudio {
  let context: AudioContext | undefined;
  let master: GainNode | undefined;
  let engineGain: GainNode | undefined;
  let engineFilter: BiquadFilterNode | undefined;
  let oscillators: OscillatorNode[] = [];
  let windGain: GainNode | undefined;
  let noiseSource: AudioBufferSourceNode | undefined;
  let muted = false;

  const unlock = () => {
    if (context) {
      if (context.state === 'suspended') void context.resume();
      return;
    }
    try {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      context = new Ctor();
      master = context.createGain();
      master.gain.value = muted ? 0 : 0.55;
      master.connect(context.destination);

      engineFilter = context.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 720;
      engineFilter.Q.value = 6;

      engineGain = context.createGain();
      engineGain.gain.value = 0;
      engineFilter.connect(engineGain);
      engineGain.connect(master);

      // 两个略微失谐的锯齿波，叠出粗糙的引擎质感
      oscillators = [1, 1.51].map((ratio, i) => {
        const oscillator = context!.createOscillator();
        oscillator.type = i === 0 ? 'sawtooth' : 'square';
        oscillator.frequency.value = 60 * ratio;
        const gain = context!.createGain();
        gain.gain.value = i === 0 ? 0.6 : 0.25;
        oscillator.connect(gain);
        gain.connect(engineFilter!);
        oscillator.start();
        return oscillator;
      });

      // 风噪：白噪声 + 高通
      const buffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      noiseSource = context.createBufferSource();
      noiseSource.buffer = buffer;
      noiseSource.loop = true;
      const windFilter = context.createBiquadFilter();
      windFilter.type = 'highpass';
      windFilter.frequency.value = 900;
      windGain = context.createGain();
      windGain.gain.value = 0;
      noiseSource.connect(windFilter);
      windFilter.connect(windGain);
      windGain.connect(master);
      noiseSource.start();
    } catch {
      context = undefined;
    }
  };

  const update = (speedRatio: number, throttle: number, boosting: boolean, offroad: boolean) => {
    if (!context || !engineGain || !engineFilter || !windGain) return;
    const now = context.currentTime;
    const clamped = Math.min(1, Math.max(0, speedRatio));
    const base = 52 + clamped * 168 + (boosting ? 26 : 0);
    oscillators.forEach((oscillator, i) => {
      oscillator.frequency.setTargetAtTime(base * (i === 0 ? 1 : 1.51), now, 0.06);
    });
    engineFilter.frequency.setTargetAtTime(620 + clamped * 1800 + (offroad ? 260 : 0), now, 0.08);
    engineGain.gain.setTargetAtTime(0.05 + throttle * 0.045 + clamped * 0.03, now, 0.08);
    windGain.gain.setTargetAtTime(Math.max(0, clamped - 0.25) * 0.05 + (offroad ? 0.02 : 0), now, 0.12);
  };

  const beep = (frequency: number, duration: number) => {
    if (!context || !master) return;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'triangle';
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.18, context.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + duration);
    oscillator.connect(gain);
    gain.connect(master);
    oscillator.start();
    oscillator.stop(context.currentTime + duration + 0.02);
  };

  const setMuted = (value: boolean) => {
    muted = value;
    if (master && context) master.gain.setTargetAtTime(value ? 0 : 0.55, context.currentTime, 0.05);
  };

  const dispose = () => {
    try {
      oscillators.forEach((oscillator) => oscillator.stop());
      noiseSource?.stop();
      void context?.close();
    } catch {
      /* 忽略关闭时的异常 */
    }
    oscillators = [];
    context = undefined;
  };

  return { unlock, update, beep, setMuted, dispose };
}
