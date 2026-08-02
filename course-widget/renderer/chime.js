// 纯 WebAudio 合成提示音/铃声（参考 study-desk 的 lib/audio.ts，MIT）
// 无需任何音频文件，离线可用；由 widget/setup 页面加载。
let _chimeCtx = null;
function _ac() {
  if (!_chimeCtx) _chimeCtx = new AudioContext();
  if (_chimeCtx.state === 'suspended') _chimeCtx.resume();
  return _chimeCtx;
}
function playChime(id, volume) {
  const c = _ac();
  const v = (volume == null) ? 0.8 : Math.max(0, Math.min(1, volume));
  const t0 = c.currentTime;
  const master = c.createGain();
  master.gain.value = v;
  master.connect(c.destination);
  const note = (freq, start, dur, type) => {
    type = type || 'sine';
    const o = c.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0 + start);
    g.gain.exponentialRampToValueAtTime(0.9, t0 + start + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + start + dur);
    o.connect(g);
    g.connect(master);
    o.start(t0 + start);
    o.stop(t0 + start + dur + 0.05);
  };
  switch (id) {
    case 'school-bell': {
      const dur = 2.4, rate = 20, step = 1 / rate;
      const partials = [[640, 0.5, 'square'], [1280, 0.3, 'sine'], [1980, 0.18, 'sine'], [3160, 0.09, 'sine']];
      for (const [freq, amp, type] of partials) {
        const o = c.createOscillator();
        o.type = type;
        o.frequency.value = freq;
        const g = c.createGain();
        g.gain.setValueAtTime(0.0001, t0);
        for (let t = 0; t < dur; t += step) {
          const decay = 1 - t / dur;
          const st = t0 + t;
          g.gain.setValueAtTime(0.02 * decay + 0.0001, st);
          g.gain.exponentialRampToValueAtTime(Math.max(0.03, amp * decay), st + 0.003);
          g.gain.exponentialRampToValueAtTime(0.02 * decay + 0.0001, st + step * 0.85);
        }
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur + 0.1);
        o.connect(g); g.connect(master);
        o.start(t0); o.stop(t0 + dur + 0.15);
      }
      break;
    }
    case 'westminster': {
      const seq = [659.25, 587.33, 523.25, 392.0];
      seq.forEach((f, i) => {
        const start = i * 0.6;
        const parts = [[f, 0.55], [f * 2.01, 0.16], [f * 3.0, 0.08], [f * 4.16, 0.045]];
        for (const [freq, amp] of parts) {
          const o = c.createOscillator();
          o.type = 'sine';
          o.frequency.value = freq;
          const g = c.createGain();
          g.gain.setValueAtTime(0.0001, t0 + start);
          g.gain.exponentialRampToValueAtTime(amp, t0 + start + 0.008);
          g.gain.exponentialRampToValueAtTime(0.0001, t0 + start + 1.7);
          o.connect(g); g.connect(master);
          o.start(t0 + start); o.stop(t0 + start + 1.8);
        }
      });
      break;
    }
    case 'dingdong':
      note(987.77, 0, 0.7);
      note(659.25, 0.28, 0.9);
      break;
    case 'bell':
      note(1318.51, 0, 1.4, 'triangle');
      note(1975.53, 0, 1.2, 'sine');
      break;
    case 'marimba':
      note(523.25, 0, 0.35, 'triangle');
      note(659.25, 0.11, 0.35, 'triangle');
      note(783.99, 0.22, 0.5, 'triangle');
      break;
    case 'chord':
      note(523.25, 0, 1.0);
      note(659.25, 0, 1.0);
      note(783.99, 0, 1.0);
      break;
    default:
      note(880, 0, 0.45);
      note(1174.66, 0.14, 0.5);
  }
}
const CHIME_PRESETS = [
  { id: 'school-bell', label: '校园电铃（上下课）' },
  { id: 'westminster', label: '音乐钟声（上下课）' },
  { id: 'dingdong', label: '叮咚' },
  { id: 'bell', label: '清亮铃声' },
  { id: 'marimba', label: '木琴' },
  { id: 'chord', label: '和弦' }
];
