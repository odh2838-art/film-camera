// 강도 다이얼: 카메라 링처럼 둥글게 도는 눈금(0~100).
// 왼쪽으로 돌리면(손가락을 왼쪽으로) 강해지고, 오른쪽으로 돌리면 약해진다. 손을 튕기면 조금 더 돌다 멈춘다.
//   area      손가락으로 잡는 칸 (눈금보다 넓게 잡아서 돌리기 쉽게 한다)
//   canvas    눈금을 그리는 곳
//   onInput   돌리는 동안 값이 바뀔 때마다 부른다
//   onChange  손을 떼고 멈췄을 때 한 번 부른다 (값은 정수)
const PPU = 6;   // 강도 1 = 화면 6px

export function createDial(area, canvas, { onInput, onChange }) {
  const ctx = canvas.getContext('2d');
  const motionOff = matchMedia('(prefers-reduced-motion: reduce)');
  const clamp = v => Math.max(0, Math.min(100, v));
  let val = 50, spin = 0, ink = '#fff', accent = '#ffd60a';

  function draw() {
    const r = devicePixelRatio || 1, W = canvas.width / r, H = canvas.height / r;
    if (!W) return;
    const cx = W / 2, top = 6, R = W * 3;
    ctx.setTransform(r, 0, 0, r, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.lineCap = 'round'; ctx.strokeStyle = ink;
    for (let t = 0; t <= 100; t += 2) {
      const th = (t - val) * PPU / R, sn = Math.sin(th), cs = Math.cos(th);
      const x = cx + R * sn, y = top + R * (1 - cs);
      const edge = Math.abs(x - cx) / (W / 2 - 8);
      if (edge >= 1) continue;
      const major = t % 10 === 0, len = major ? 14 : 8;
      ctx.globalAlpha = (major ? 0.9 : 0.4) * (1 - edge * edge);   // 가장자리로 갈수록 흐려진다
      ctx.lineWidth = major ? 2 : 1.5;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - sn * len, y + cs * len); ctx.stroke();
    }
    // 가운데 노란 선이 지금 강도다
    ctx.globalAlpha = 1; ctx.strokeStyle = accent; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(cx, 2); ctx.lineTo(cx, top + 18); ctx.stroke();
  }
  // 숨겨져 있다가 다시 보이면 크기가 0이었던 채로 남아 있으니, 보일 때마다 불러서 크기를 다시 맞춘다
  function resize() {
    const r = devicePixelRatio || 1, w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    const s = getComputedStyle(canvas);
    ink = s.getPropertyValue('--ink').trim() || ink; accent = s.getPropertyValue('--accent').trim() || accent;
    if (canvas.width !== Math.round(w * r) || canvas.height !== Math.round(h * r)) { canvas.width = Math.round(w * r); canvas.height = Math.round(h * r); }
    draw();
  }
  function set(v) { cancelAnimationFrame(spin); val = clamp(v); draw(); }
  function input(v) { val = clamp(v); draw(); onInput(val); }
  function commit() { val = Math.round(val); draw(); onChange(val); }

  let dragX = 0, dragV = 0, lastX = 0, lastT = 0, vel = 0;
  area.addEventListener('pointerdown', e => {
    cancelAnimationFrame(spin);
    area.setPointerCapture(e.pointerId);
    dragX = lastX = e.clientX; dragV = val; lastT = e.timeStamp; vel = 0;
  });
  area.addEventListener('pointermove', e => {
    if (!area.hasPointerCapture(e.pointerId)) return;
    const dt = Math.max(1, e.timeStamp - lastT);
    vel = -(e.clientX - lastX) / PPU / dt;        // 강도/ms
    lastX = e.clientX; lastT = e.timeStamp;
    input(dragV - (e.clientX - dragX) / PPU);
  });
  function endDrag(e) {
    if (!area.hasPointerCapture(e.pointerId)) return;
    area.releasePointerCapture(e.pointerId);
    if (motionOff.matches || Math.abs(vel) < 0.02 || e.timeStamp - lastT > 80) { commit(); return; }
    let v = vel * 16, prev = performance.now();
    const step = now => {
      const k = Math.min(3, (now - prev) / 16); prev = now;
      input(val + v * k); v *= Math.pow(0.9, k);
      if (Math.abs(v) > 0.05 && val > 0 && val < 100) spin = requestAnimationFrame(step); else commit();
    };
    spin = requestAnimationFrame(step);
  }
  area.addEventListener('pointerup', endDrag);
  area.addEventListener('pointercancel', endDrag);

  return { set, resize, get value() { return val; } };
}
