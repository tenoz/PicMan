/**
 * 合成音效工具 — 使用 Web Audio API 生成，无需外部音频文件。
 * AudioContext 延迟初始化（用户交互时首次创建），符合浏览器自动播放策略。
 */

let ctx: AudioContext | null = null;

function getContext(): AudioContext {
  if (!ctx) {
    ctx = new AudioContext();
  }
  // 恢复因浏览器策略暂停的上下文
  if (ctx.state === 'suspended') {
    ctx.resume();
  }
  return ctx;
}

/** 播放一个纯音 */
function playTone(
  frequency: number,
  startTime: number,
  duration: number,
  gainValue: number,
  type: OscillatorType = 'sine'
): void {
  const ac = getContext();
  const osc = ac.createOscillator();
  const gain = ac.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(frequency, startTime);
  gain.gain.setValueAtTime(gainValue, startTime);
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

  osc.connect(gain);
  gain.connect(ac.destination);

  osc.start(startTime);
  osc.stop(startTime + duration);
}

/**
 * 成功提示音 — 三音上扬 "叮、叮、咚～"
 */
export function playSuccessSound(): void {
  try {
    const ac = getContext();
    const now = ac.currentTime;

    // 三个音，频率依次升高，营造"成功完成"的感受
    playTone(660, now, 0.12, 0.3, 'sine');         // E5
    playTone(880, now + 0.12, 0.12, 0.3, 'sine');   // A5
    playTone(1100, now + 0.24, 0.25, 0.25, 'sine'); // C#6 稍长收尾
  } catch {
    // AudioContext 不可用时静默失败
  }
}

/**
 * 暂停提示音 — 低沉短促单音
 */
export function playPauseSound(): void {
  try {
    const ac = getContext();
    const now = ac.currentTime;

    playTone(440, now, 0.15, 0.2, 'triangle');
  } catch {
    // 静默失败
  }
}
