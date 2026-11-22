// optikē 앱 동작. 차례: 준비 → 안내 → 필름 강도 → 칸 배치 → 필름 창 → 그리기 → 필름 고르기
//                    → 날짜 도장 → 카메라 → 앨범 → 찍기 → 결과 화면 → 시작
// 필름 계산은 shader.js, 강도 다이얼은 dial.js, 날짜 도장 그림은 stamp.js, 필름 숫자는 films.js 에 있다.
import { createRenderer, applyFilm, drawFrame, NO_FILM } from './shader.js';
import { createDial } from './dial.js';
import { drawStamp } from './stamp.js';

/* ───────── 준비 ───────── */
const FILMS = window.FILMS || [];
const $ = id => document.getElementById(id);
const app = $('app'), canvas = $('gl'), video = $('video'), view = $('view'), filmsEl = $('films');
const motionOff = matchMedia('(prefers-reduced-motion: reduce)');   // 아이폰 설정 "동작 줄이기"
// 움직임 시간과 빠르기는 style.css 의 변수를 그대로 쓴다
const rootStyle = getComputedStyle(document.documentElement);
const DUR = parseFloat(rootStyle.getPropertyValue('--dur')) * 1000 || 300;
const EASE = rootStyle.getPropertyValue('--ease').trim() || 'ease';

const PREVIEW_MAX = 1920;   // 화면에 그릴 때 긴 변 최대
const MAX_PHOTO = 4096;     // 저장할 때 긴 변 최대 (아이폰 메모리 여유)
const ALBUM_VIEW = 2400;    // 앨범 사진을 화면에 올릴 때 긴 변 최대
const T = 120, THUMB_EVERY = 250;   // 필름 미리보기 한 칸 크기, 새로 그리는 간격(ms)

/* 사진 비율. 기본 카메라와 같은 세 가지다.
   h 는 세로/가로, wide 는 카메라에 16:9 영상을 달라고 할지다. */
const RATIOS = {
  '4:3':  { h: 4 / 3,  wide: false, say: '기본 비율이에요. 카메라가 보는 전부를 담아요.' },
  '1:1':  { h: 1,      wide: false, say: '정사각형이에요. 프로필 사진이나 SNS에 좋아요.' },
  '16:9': { h: 16 / 9, wide: true,  say: '길쭉한 비율이에요. 휴대폰 화면에 꽉 차요.' }
};

// 지금 상태
let main, thumbs, dial;            // 큰 화면 / 필름 미리보기 / 강도 다이얼
let film = null;                   // 지금 필름
let source = null;                 // 지금 그리는 것: video(카메라) 또는 앨범 사진 캔버스
let albumFull = null;              // 앨범 사진의 큰 판 (저장용)
let stream = null, facing = 'environment', ratio = '4:3';
let trayOpen = false, startOpen = true, resultOpen = false, busy = false, lastBlob = null;

// 아이폰 "비공개 브라우징"에서는 기억하기가 막혀 있을 수 있어서, 안 돼도 그냥 넘어간다
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
  del(k) { try { localStorage.removeItem(k); } catch (e) {} }
};
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
function fitSize(w, h, max) { const k = Math.min(1, max / Math.max(w, h)); return [Math.round(w * k), Math.round(h * k)]; }
function isPhoto() { return !!source && source !== video; }
function srcSize() { return source === video ? [video.videoWidth, video.videoHeight] : [source.width, source.height]; }
function ready() {
  if (!source) return false;
  if (source === video && video.readyState < 2) return false;
  const [w, h] = srcSize(); return w > 0 && h > 0;
}

/* ───────── 안내 ───────── */
// 화면 위쪽에 잠깐 뜨는 글. 화면 읽어 주기도 읽는다.
let toastTimer;
function toast(msg, ms) {
  const t = $('toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), ms || 3000);
}
// 화면에는 안 보이고 화면 읽어 주기로만 알린다 (보이는 사람은 화면이 바뀐 걸로 이미 안다)
function say(msg) {
  const l = $('live'); l.textContent = '';   // 같은 말을 두 번 해도 다시 읽게 비웠다가 넣는다
  setTimeout(() => { l.textContent = msg; }, 50);
}
// 시작 화면이나 결과 화면이 떠 있으면 뒤에 있는 촬영 화면은 누를 수도, 읽을 수도 없게 잠근다
function syncModal() { app.inert = startOpen || resultOpen; }

/* ───────── 필름 강도 ─────────
   사용자가 돌려서 정한 값(0~100)을 필름마다 기억한다. 처음 값은 films.js 의 amount, 없으면 100. */
let amounts = {};
try { amounts = JSON.parse(store.get('amounts')) || {}; } catch (e) {}
function amountOf(f) {
  if (!f || f.fixed) return 1;   // 강도 조절이 없는 필름은 항상 최대
  const v = amounts[f.id] != null ? amounts[f.id] : (f.amount != null ? f.amount : 100);
  return clamp(v, 0, 100) / 100;
}
// 지금 필름과 강도를 큰 화면에 건다
function applyNow() { applyFilm(main, film || NO_FILM, amountOf(film)); }
function showAmountValue(v) {
  const n = Math.round(v);
  $('amountNum').textContent = n;
  $('amountInput').value = n;
  $('amountInput').setAttribute('aria-valuetext', `${n}. 0은 원본, 100은 가장 강하게`);
}
// 필름이 바뀌면 그 필름의 강도를 다이얼에 보여 준다
function showAmount() {
  $('amount').hidden = !!(film && film.fixed);   // 강도 조절이 없는 필름은 다이얼을 숨긴다
  const v = amountOf(film) * 100;
  dial.set(v); showAmountValue(v);
  if (!$('amount').hidden) dial.resize();
}
// 돌리는 동안: 바로 화면에 보인다
function setAmount(v) {
  if (!film) return;
  amounts[film.id] = v;
  applyNow(); showAmountValue(v); updateStamp();
}
// 손을 뗐을 때: 정수로 맞춰 기억하고 필름 미리보기도 새로 그린다
function saveAmount(v) {
  if (!film) return;
  setAmount(Math.round(v));
  store.set('amounts', JSON.stringify(amounts));
  drawThumbs();
}

/* ───────── 칸 배치 ─────────
   셔터 줄은 맨 아래에 고정이다.
   뷰파인더는 셔터 줄 위에 남는 공간의 한가운데에 놓는다. 기본 카메라와 같다.
   필름 창이 열려 있으면 뷰파인더를 맨 위로 올려서 창이 사진을 덜 가리게 한다.
   그 공간보다 긴 비율(16:9)은 화면 전체의 가운데에 놓고, 셔터 줄이 그 위에 반투명하게 얹힌다. */
function layout() {
  const W = app.clientWidth, H = app.clientHeight;
  const safeTop = parseFloat(getComputedStyle(app).paddingTop) || 0;
  const barH = $('bar').offsetHeight;
  app.style.setProperty('--bar', barH + 'px');   // 필름 버튼과 필름 창이 셔터 줄 바로 위에 온다
  const photo = isPhoto(), room = H - safeTop - barH;
  // 비율을 바꿔도 뷰파인더 가운데는 그대로 두고 위아래로 똑같이 커지고 작아진다 (기본 카메라와 같다).
  // 화면 밖으로 넘치면 넘친 만큼만 안으로 밀어 넣는다.
  // 화면보다 길면(사파리에서 16:9) 비율이 틀어지지 않게 폭을 줄이고 가운데에 둔다.
  let w = W, h = photo ? room : W * RATIOS[ratio].h, top;
  if (!photo && h > H) { h = H; w = Math.round(H / RATIOS[ratio].h); }
  if (trayOpen && !photo && h <= room) top = safeTop;
  else top = clamp(safeTop + room / 2 - h / 2, 0, Math.max(0, H - h));
  view.style.left = (W - w) / 2 + 'px'; view.style.width = w + 'px'; view.style.right = 'auto';
  view.style.top = top + 'px'; view.style.height = h + 'px';
  $('ratio').hidden = photo || trayOpen;
  // 앨범 사진을 보는 동안은 "앞뒤 바꾸기" 대신 "카메라"(돌아가기)를 보여 준다
  $('flip').hidden = photo; $('toCam').hidden = !photo;
  $('shutter').setAttribute('aria-label', photo ? '이 사진에 필름 입히기' : '사진 찍기');
  view.setAttribute('aria-label', photo ? '앨범에서 고른 사진' : '카메라 화면');
  updateStamp();
}
// 뷰파인더가 커지고 작아지는 중일 수 있어서, 지금 크기 대신 도착할 크기를 쓴다
function viewSize() {
  return [parseFloat(view.style.width) || view.clientWidth, parseFloat(view.style.height) || view.clientHeight];
}

async function setRatio(r, announce) {
  const before = ratio;
  ratio = r;
  $('ratio').textContent = r;
  $('ratio').setAttribute('aria-label', `사진 비율 ${r}. 누르면 바뀌어요`);
  store.set('ratio', r);
  layout();
  if (announce) toast(RATIOS[r].say);
  if (stream && RATIOS[before].wide !== RATIOS[r].wide) {
    try { await ensureCamera(true); } catch (e) { if (!e || e.name !== 'Stale') toast('카메라를 다시 켜지 못했어요. 잠시 뒤 다시 눌러 주세요.'); }
  }
}
$('ratio').onclick = () => { const k = Object.keys(RATIOS); setRatio(k[(k.indexOf(ratio) + 1) % k.length], true); };

/* ───────── 필름 창 ─────────
   필름 버튼을 누르면 열리고, 완료나 사진을 누르면(키보드는 Esc) 닫힌다 */
function setTray(open) {
  if (open === trayOpen) return;
  const inside = $('band').contains(document.activeElement);
  trayOpen = open;
  $('band').classList.toggle('open', open);
  $('filmBtn').setAttribute('aria-expanded', open);
  $('dock').hidden = open || !FILMS.length;
  layout();
  if (open) {
    drawThumbs(); goToFilm(FILMS.indexOf(film), false); dial.resize();
    const cur = items[FILMS.indexOf(film)];
    if (cur) cur.focus({ preventScroll: true });   // 키보드와 화면 읽어 주기가 창 안에서 이어지게
  } else if (inside) $('filmBtn').focus({ preventScroll: true });
}
$('filmBtn').onclick = () => setTray(true);
$('done').onclick = () => setTray(false);
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (resultOpen) $('back').click(); else if (trayOpen) setTray(false);
});

/* ───────── 그리기 ───────── */
// 동작 줄이기를 켜면 입자, 깜빡임, 긁힘이 움직이지 않게 시각을 멈춘다
function liveTime() { return source === video && !motionOff.matches ? (performance.now() % 1000) / 1000 : 0.37; }
function liveMirror() { return source === video && facing === 'user' ? 1 : 0; }
// 큰 화면: 매 프레임 그린다. 화면에는 줄여서 그린다
function draw() {
  if (!ready()) return;
  const [sw, sh] = srcSize(), [w, h] = fitSize(sw, sh, PREVIEW_MAX);
  drawFrame(main, source, w, h, liveTime(), liveMirror());
}
// 필름 미리보기: 작게 줄인 화면 한 장에 모든 필름을 나란히 그린다
function initThumbs() {
  const atlas = document.createElement('canvas');
  atlas.width = T * Math.max(1, FILMS.length); atlas.height = T;
  const small = document.createElement('canvas'); small.width = small.height = T;
  thumbs = { r: createRenderer(atlas), atlas, small, sctx: small.getContext('2d'), ctxs: [], last: 0 };
}
function drawThumbs() {
  if (!ready()) return;
  const { r, atlas, small, sctx, ctxs } = thumbs, { g, u } = r, [w, h] = srcSize(), s = Math.min(w, h);
  sctx.drawImage(source, (w - s) / 2, (h - s) / 2, s, s, 0, 0, T, T);
  g.texImage2D(g.TEXTURE_2D, 0, g.RGB, g.RGB, g.UNSIGNED_BYTE, small);
  g.uniform2f(u.uRes, T, T);
  g.uniform1f(u.uTime, 0.37);
  g.uniform1f(u.uMirror, liveMirror());
  FILMS.forEach((f, i) => { g.viewport(i * T, 0, T, T); applyFilm(r, f, amountOf(f)); g.drawArrays(g.TRIANGLE_STRIP, 0, 4); });
  ctxs.forEach((c, i) => c.drawImage(atlas, i * T, 0, T, T, 0, 0, T, T));
  thumbs.last = performance.now();
}
// 결과 화면이 떠 있는 동안은 뒤에서 그리지 않는다 (배터리와 발열을 아낀다)
function loop(now) {
  if (!resultOpen) {
    draw();
    if (trayOpen && source === video && now - thumbs.last > THUMB_EVERY) drawThumbs();
  }
  requestAnimationFrame(loop);
}

/* ───────── 필름 고르기 ─────────
   필름 미리보기를 좌우로 밀어서 가운데 온 필름이 바로 선택된다 */
const items = [];
let seeking = -1, seekTimer;   // 눌러서 고른 필름으로 미끄러져 가는 중이면 그 필름 번호
function setFilm(f) {
  if (film === f && $('filmName').textContent) return;
  const first = !film;   // 앱을 막 열었을 때는 소리 내어 알리지 않는다
  film = f; applyNow();
  $('filmName').textContent = f.name; $('filmWhen').textContent = f.when;
  $('filmBtn').textContent = '필름 · ' + f.name;
  $('filmBtn').setAttribute('aria-label', `필름 ${f.name}. 누르면 필름을 고를 수 있어요`);
  $('label').animate(motionOff.matches ? [{ opacity: 0 }, { opacity: 1 }]
    : [{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none' }], { duration: 200, easing: EASE });
  // 고른 필름 하나만 Tab 으로 닿고, 나머지는 화살표로 옮긴다
  items.forEach((b, i) => { const on = FILMS[i] === f; b.setAttribute('aria-checked', on); b.tabIndex = on ? 0 : -1; });
  // 그 필름 버튼에 이미 가 있으면 화면 읽어 주기가 알아서 읽으니 따로 알리지 않는다
  if (!first && document.activeElement !== items[FILMS.indexOf(f)]) say(`${f.name} 필름. ${f.when}`);
  showAmount();
  updateStamp();
  store.set('film', f.id);
}
function buildFilms() {
  FILMS.forEach((f, i) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'film';
    b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', 'false'); b.tabIndex = -1;
    b.setAttribute('aria-label', `${f.name}. ${f.when}`);
    const c = document.createElement('canvas'); c.width = c.height = T;
    b.appendChild(c); thumbs.ctxs.push(c.getContext('2d'));
    b.onclick = () => goToFilm(i, true);
    filmsEl.appendChild(b); items.push(b);
  });
}
function goToFilm(i, smooth) {
  if (!FILMS.length) return;
  i = clamp(i, 0, FILMS.length - 1);
  const glide = smooth && !motionOff.matches;
  // 미끄러져 가는 동안 지나치는 필름이 잠깐씩 선택되지 않게, 도착할 때까지 가운데 필름 확인을 쉰다
  seeking = glide ? i : -1;
  if (glide) seekSoon(HAS_SCROLLEND ? 1500 : 500); else clearTimeout(seekTimer);
  filmsEl.scrollTo({ left: filmLeft(i), behavior: glide ? 'smooth' : 'auto' });
  setFilm(FILMS[i]);
  scaleFilms();
}
// 미끄러짐이 끝나면 다시 가운데 필름을 따른다.
// 끝난 걸 알려 주는 브라우저(scrollend)는 그 소식을 기다리고, 아니면 스크롤 소식이 잠깐 끊기면 끝난 걸로 본다.
const HAS_SCROLLEND = 'onscrollend' in window;
function seekSoon(ms) { clearTimeout(seekTimer); seekTimer = setTimeout(endSeek, ms); }
function filmLeft(i) { const b = items[i]; return b.offsetLeft - (filmsEl.clientWidth - b.offsetWidth) / 2; }
function endSeek() {
  clearTimeout(seekTimer);
  if (seeking < 0) return;
  const i = seeking; seeking = -1;
  // 미끄러짐이 중간에 멈췄어도 고른 필름이 이긴다: 그 자리로 바로 옮긴다
  if (centerIndex() !== i) filmsEl.scrollTo({ left: filmLeft(i), behavior: 'auto' });
  setFilm(FILMS[i]); scaleFilms();
}
function centerIndex() {
  const mid = filmsEl.scrollLeft + filmsEl.clientWidth / 2;
  let best = 0, dist = Infinity;
  items.forEach((b, i) => { const d = Math.abs(b.offsetLeft + b.offsetWidth / 2 - mid); if (d < dist) { dist = d; best = i; } });
  return best;
}
// 가운데에 가까울수록 크고 또렷하게 보인다
function scaleFilms() {
  const mid = filmsEl.scrollLeft + filmsEl.clientWidth / 2;
  const gap = parseFloat(getComputedStyle(filmsEl).columnGap) || 0;
  items.forEach(b => {
    const d = Math.min(1, Math.abs(b.offsetLeft + b.offsetWidth / 2 - mid) / (b.offsetWidth + gap));
    b.style.transform = `scale(${1 - d * 0.18})`;
    b.style.opacity = 1 - d * 0.5;
  });
}
filmsEl.addEventListener('scroll', () => {
  if (!FILMS.length) return;
  scaleFilms();
  const c = centerIndex();
  if (seeking >= 0) { if (c === seeking) { seeking = -1; clearTimeout(seekTimer); } else if (!HAS_SCROLLEND) seekSoon(150); return; }
  setFilm(FILMS[c]);
}, { passive: true });
filmsEl.addEventListener('scrollend', endSeek);
filmsEl.addEventListener('pointerdown', () => { seeking = -1; clearTimeout(seekTimer); });   // 손으로 다시 잡으면 손을 따른다
// 키보드: 좌우 화살표로 옆 필름, Home/End 로 처음과 끝
filmsEl.addEventListener('keydown', e => {
  const cur = FILMS.indexOf(film);
  const to = { ArrowRight: cur + 1, ArrowDown: cur + 1, ArrowLeft: cur - 1, ArrowUp: cur - 1, Home: 0, End: FILMS.length - 1 }[e.key];
  if (to == null) return;
  e.preventDefault();
  const i = clamp(to, 0, FILMS.length - 1);
  items[i].focus({ preventScroll: true });
  goToFilm(i, true);
});
// 화면을 좌우로 쓸어도 옆 필름으로 넘어간다. 필름 창이 열려 있을 때 사진을 톡 누르면 창이 닫힌다
let downX = 0, downY = 0;
view.addEventListener('pointerdown', e => { downX = e.clientX; downY = e.clientY; });
view.addEventListener('pointerup', e => {
  const dx = e.clientX - downX, dy = e.clientY - downY;
  if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.5) goToFilm(FILMS.indexOf(film) + (dx < 0 ? 1 : -1), true);
  else if (trayOpen && Math.abs(dx) < 8 && Math.abs(dy) < 8) setTray(false);
});
addEventListener('resize', () => { layout(); goToFilm(FILMS.indexOf(film), false); dial.resize(); });

/* ───────── 날짜 도장 (화면에 보이는 쪽) ───────── */
function stampOn() { return !!(film && film.stamp === 'date' && amountOf(film) >= 0.2); }
function stampSoft() { return !!(film && film.stampStyle === 'soft'); }
function updateStamp() {
  const c = $('stamp'), on = stampOn() && !!source;
  c.hidden = !on;
  if (!on) return;
  const r = devicePixelRatio || 1, [vw, vh] = viewSize(), w = Math.round(vw * r), h = Math.round(vh * r);
  if (!w || !h) return;
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  const ctx = c.getContext('2d'); ctx.clearRect(0, 0, w, h);
  // 앨범 사진은 뷰파인더 안에 여백을 두고 놓이므로, 사진이 보이는 칸 안에 찍는다
  const [sw, sh] = srcSize();
  if (isPhoto() && sw && sh) {
    const k = Math.min(w / sw, h / sh), dw = sw * k, dh = sh * k;
    ctx.save(); ctx.translate((w - dw) / 2, (h - dh) / 2); drawStamp(ctx, dw, dh, stampSoft()); ctx.restore();
  } else drawStamp(ctx, w, h, stampSoft());
}
setInterval(updateStamp, 15000);   // 시간이 바뀌면 도장도 바뀌게

/* ───────── 카메라 ─────────
   - 처음에만 시작 화면에서 "카메라 켜기"를 누른다. 한 번 켜면 기억해 두고 다음에는 시작 화면 없이 바로 켠다.
   - 앱을 나가면 카메라를 끄고(초록 불이 남지 않게), 돌아오면 다시 켠다 (아이폰은 나갔다 오면 영상이 멈춰 있다).
   - 영상은 카메라가 낼 수 있는 가장 큰 크기로 받는다. 셔터를 누른 그 장면을 큰 크기 그대로 저장하기 위해서다. */
// 카메라를 켤 때마다 번호를 하나씩 올린다. 늦게 도착한 예전 요청은 번호가 달라서 버린다.
let camGen = 0, cameraWanted = false, starting = null;
function stopStream(s) { if (s) s.getTracks().forEach(t => t.stop()); }
async function startCamera() {
  const my = ++camGen;
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw { name: 'NoCamera' };
  stopStream(stream); stream = null;
  const wide = RATIOS[ratio].wide;
  const s = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: { facingMode: { ideal: facing }, aspectRatio: { ideal: wide ? 16 / 9 : 4 / 3 },
             width: { ideal: wide ? 3840 : 4032 }, height: { ideal: wide ? 2160 : 3024 }, frameRate: { ideal: 30 } }
  });
  if (my !== camGen) { stopStream(s); throw { name: 'Stale' }; }
  if (document.hidden) { stopStream(s); cameraWanted = true; throw { name: 'Stale' }; }
  stream = s; video.srcObject = s;
  try { await video.play(); }
  catch (e) { if (my !== camGen) throw { name: 'Stale' }; throw { name: 'PlayBlocked' }; }
  if (my !== camGen) throw { name: 'Stale' };
  source = video; albumFull = null; canvas.style.objectFit = 'cover';
  cameraWanted = true;
  store.set('camera', 'on');
  // 다른 앱이 카메라를 가져가거나 전화가 오면 영상이 끊긴다. 화면이 보이는 중이면 다시 켠다.
  const track = stream.getVideoTracks()[0];
  if (track) track.addEventListener('ended', () => { if (!document.hidden) resumeCamera(); });
  layout();
}
// fresh 가 참이면(사용자가 버튼을 눌렀을 때) 하던 요청을 버리고 새로 켠다.
// 아이폰은 앱을 막 열었을 때 버튼을 누르기 전의 카메라 요청에 답하지 않고 멈춰 있을 때가 있다.
function ensureCamera(fresh) {
  if (fresh || !starting) {
    const p = startCamera().finally(() => { if (starting === p) starting = null; });
    starting = p;
  }
  return starting;
}
function showStart(msg) {
  const s = $('start');
  s.getAnimations().forEach(a => a.cancel());
  s.hidden = false; $('err').textContent = msg || '';
  startOpen = true; syncModal();
}
function hideStart() {
  const s = $('start');
  startOpen = false; syncModal();
  if (s.hidden) return;
  s.animate([{ opacity: 1 }, { opacity: 0 }], { duration: DUR, easing: EASE }).onfinish = () => { if (!startOpen) s.hidden = true; };
}
// 시작 화면 없이 켜 보고, 2.5초 안에 안 켜지면 시작 화면을 보여 줘서 버튼으로 다시 켤 수 있게 한다
function autoCamera() {
  if (document.hidden) return;
  $('start').hidden = true; startOpen = false; syncModal();
  const fallback = setTimeout(() => { if (!stream) showStart(''); }, 2500);
  ensureCamera().then(() => { clearTimeout(fallback); hideStart(); }, e => {
    clearTimeout(fallback);
    if (e && e.name === 'Stale') return;
    if (e && e.name === 'NotAllowedError') store.del('camera');
    showStart(e && (e.name === 'NotAllowedError' || e.name === 'NoCamera') ? cameraError(e) : '');
  });
}
async function resumeCamera() {
  if (!cameraWanted || document.hidden) return;
  const track = stream && stream.getVideoTracks()[0];
  if (track && track.readyState === 'live') { try { await video.play(); return; } catch (e) {} }
  autoCamera();
}
function pauseCamera() { stopStream(stream); stream = null; }
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { pauseCamera(); return; }
  scrollTo(0, 0); layout();   // 돌아왔을 때 화면이 밀려 있으면 제자리로
  resumeCamera();
});
addEventListener('pageshow', e => { if (e.persisted) resumeCamera(); });
video.addEventListener('pause', () => { if (cameraWanted && !document.hidden && stream) video.play().catch(() => {}); });
// 홈 화면에 추가한 앱으로 열었는지 (주소창이 없다)
function isHomeApp() { return navigator.standalone === true || matchMedia('(display-mode: standalone)').matches; }
// 원인을 모르는 오류는 문구 끝에 오류 이름을 괄호로 붙인다. 사용자가 알려 주면 원인을 찾는 데 쓴다.
function cameraError(e) {
  const n = e && e.name;
  if (n === 'NotAllowedError') return isHomeApp()
    ? '카메라를 쓸 수 있게 허락해 주세요. 아이폰 설정의 Safari → 카메라에서 "허용"으로 바꿀 수 있어요.'
    : '카메라를 쓸 수 있게 허락해 주세요. 주소창 왼쪽 "가가" → 웹 사이트 설정 → 카메라에서 바꿀 수 있어요.';
  if (n === 'NoCamera') return '이 주소에서는 카메라를 켤 수 없어요. https로 시작하는 주소로 열어 주세요.';
  return '카메라를 켜지 못했어요. 카메라를 쓰는 다른 앱을 닫고 다시 눌러 주세요. 앨범 사진으로도 해볼 수 있어요.'
    + (n ? ` (${n})` : '');
}
$('go').onclick = async () => {
  $('err').textContent = '';
  try { await ensureCamera(true); hideStart(); }
  catch (e) { if (!e || e.name !== 'Stale') $('err').textContent = cameraError(e); }
};
$('flip').onclick = async () => {
  const before = facing;
  facing = facing === 'environment' ? 'user' : 'environment';
  try { await ensureCamera(true); say(facing === 'user' ? '앞 카메라로 바꿨어요' : '뒤 카메라로 바꿨어요'); }
  catch (e) { if (e && e.name === 'Stale') return; facing = before; toast('카메라를 바꾸지 못했어요. 잠시 뒤 다시 눌러 주세요.'); }
};
// 앨범 사진을 보다가 카메라로 돌아간다 (앞뒤는 바꾸지 않는다)
$('toCam').onclick = async () => {
  try { await ensureCamera(true); $('flip').focus({ preventScroll: true }); say('카메라로 돌아왔어요'); }
  catch (e) { if (!e || e.name !== 'Stale') toast(cameraError(e), 6000); }
};

/* ───────── 앨범 ─────────
   앨범 사진은 화면에는 가볍게(긴 변 2400), 저장할 때는 크게(긴 변 4096까지) 쓴다 */
function scaledCanvas(img, w, h, maxSide) {
  const c = document.createElement('canvas');
  [c.width, c.height] = fitSize(w, h, maxSide);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c;
}
function useImage(file) {
  const img = new Image();
  img.onload = () => {
    albumFull = scaledCanvas(img, img.naturalWidth, img.naturalHeight, MAX_PHOTO);
    const c = scaledCanvas(albumFull, albumFull.width, albumFull.height, ALBUM_VIEW);
    URL.revokeObjectURL(img.src);
    pauseCamera(); cameraWanted = false;
    source = c; canvas.style.objectFit = 'contain';
    layout();
    if (trayOpen) drawThumbs();
    hideStart();
    say('고른 사진을 불러왔어요. 필름을 고르고 가운데 버튼을 누르면 저장할 수 있어요');
  };
  img.onerror = () => {
    URL.revokeObjectURL(img.src);
    const msg = '이 사진은 열지 못했어요. 다른 사진을 골라 주세요.';
    if (startOpen) $('err').textContent = msg; else toast(msg);
  };
  img.src = URL.createObjectURL(file);
}
$('go2').onclick = $('pick').onclick = () => $('file').click();
$('file').onchange = e => { if (e.target.files[0]) useImage(e.target.files[0]); e.target.value = ''; };

/* ───────── 찍기 ─────────
   뷰파인더에 보이는 그대로, 누른 그 장면을 큰 크기로 저장한다.
   카메라 영상을 처음부터 가장 크게 받고 있어서 누른 순간과 찍힌 장면 사이에 딜레이가 없다. */
function visibleCrop() {
  const [vw, vh] = viewSize(), w = canvas.width, h = canvas.height;
  const s = isPhoto() ? Math.min(vw / w, vh / h) : Math.max(vw / w, vh / h);
  const cw = Math.round(Math.min(w, vw / s)), ch = Math.round(Math.min(h, vh / s));
  const out = document.createElement('canvas'); out.width = cw; out.height = ch;
  out.getContext('2d').drawImage(canvas, Math.round((w - cw) / 2), Math.round((h - ch) / 2), cw, ch, 0, 0, cw, ch);
  return out;
}
function cameraLive() {
  const track = stream && stream.getVideoTracks()[0];
  return !!track && track.readyState === 'live';
}
$('shutter').onclick = () => {
  if (busy || !ready()) return;
  if (source === video && !cameraLive()) return;   // 카메라를 다시 켜는 중이면(비율을 바꾼 직후 등) 찍지 않는다
  busy = true; $('shutter').classList.add('busy');
  const big = isPhoto() ? albumFull || source : video;
  const [w, h] = fitSize(...(big === video ? [video.videoWidth, video.videoHeight] : [big.width, big.height]), MAX_PHOTO);
  drawFrame(main, big, w, h, liveTime(), liveMirror());
  const out = visibleCrop();
  $('flash').animate([{ opacity: .9 }, { opacity: 0 }], { duration: 200, easing: 'ease-out' });
  if (stampOn()) drawStamp(out.getContext('2d'), out.width, out.height, stampSoft());
  out.toBlob(blob => {
    $('shutter').classList.remove('busy');
    if (!blob) { busy = false; toast('사진을 만들지 못했어요. 한 번 더 눌러 주세요.'); return; }
    lastBlob = blob; openResult(blob);
  }, 'image/jpeg', 0.92);
};

/* ───────── 결과 화면 ─────────
   사진은 뷰파인더 자리에 그대로 멈추고, 버튼이 아래에서 올라온다 */
function growFrom() {
  const a = view.getBoundingClientRect(), b = $('shot').getBoundingClientRect();
  if (!b.width) return 'none';
  const k = Math.min(a.width / b.width, a.height / b.height);
  return `translate(${a.left + a.width / 2 - (b.left + b.width / 2)}px, ${a.top + a.height / 2 - (b.top + b.height / 2)}px) scale(${k})`;
}
function playResult(forward) {
  const still = motionOff.matches, o = { duration: still ? 200 : DUR, easing: EASE, fill: 'both', direction: forward ? 'normal' : 'reverse' };
  const fade = [{ opacity: 0 }, { opacity: 1 }];
  const anims = [
    $('resultBg').animate(fade, o),
    $('actions').animate(still ? fade : [{ opacity: 0, transform: 'translateY(32px)' }, { opacity: 1, transform: 'none' }], o),
    $('shot').animate(still ? fade : [{ transform: growFrom() }, { transform: 'none' }], o)
  ];
  return Promise.all(anims.map(a => a.finished));
}
async function openResult(blob) {
  const img = $('shot'), r = view.getBoundingClientRect(), box = $('photoBox');
  box.style.top = r.top + 'px'; box.style.height = r.height + 'px';
  if (img.src) URL.revokeObjectURL(img.src);
  img.src = URL.createObjectURL(blob);
  img.alt = film ? `${film.name} 필름으로 찍은 사진` : '방금 찍은 사진';
  try { await img.decode(); } catch (e) {}
  $('result').hidden = false;
  resultOpen = true; syncModal();
  $('save').focus({ preventScroll: true });
  await playResult(true);
  busy = false;
}
$('back').onclick = async () => {
  if (busy) return;
  busy = true;
  resultOpen = false; syncModal();   // 뒤에서 다시 그리기 시작해야 돌아가는 동안 화면이 살아 있다
  await playResult(false);
  $('result').hidden = true;
  $('shutter').focus({ preventScroll: true });
  busy = false;
};
$('save').onclick = async () => {
  if (!lastBlob) return;
  const name = 'optike-' + Date.now() + '.jpg';
  const file = new File([lastBlob], name, { type: 'image/jpeg' });
  // 아이폰은 공유 창에서 "이미지 저장"을 누르면 사진 앱에 들어간다. 공유가 안 되는 곳에서는 파일로 내려받는다.
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file] }); return; }
  } catch (e) { if (e && e.name === 'AbortError') return; }
  const a = document.createElement('a'); a.href = $('shot').src; a.download = name; a.click();
};

/* ───────── 시작 ───────── */
try {
  main = createRenderer(canvas, applyNow);
  initThumbs(); buildFilms();
  dial = createDial($('amount'), $('dial'), { onInput: setAmount, onChange: saveAmount });
  // 숨은 슬라이더: 키보드 화살표와 화면 읽어 주기의 위아래 쓸기로 강도를 바꾼다
  $('amountInput').addEventListener('input', e => { dial.set(+e.target.value); setAmount(dial.value); });
  $('amountInput').addEventListener('change', e => saveAmount(+e.target.value));
  const saved = store.get('film'), savedRatio = store.get('ratio');
  const i = FILMS.findIndex(f => f.id === saved);
  setRatio(RATIOS[savedRatio] ? savedRatio : '4:3', false);
  // 필름이 하나도 없으면 원본 그대로 보여 주고 필름 버튼을 숨긴다
  if (!FILMS.length) { applyNow(); $('dock').hidden = true; }
  requestAnimationFrame(() => { layout(); goToFilm(i >= 0 ? i : 0, false); });
  requestAnimationFrame(loop);
  // 전에 카메라를 켠 적이 있으면 시작 화면 없이 바로 켠다
  if (store.get('camera') === 'on') { cameraWanted = true; autoCamera(); }
} catch (e) {
  $('err').textContent = '이 브라우저에서는 필름 효과를 쓸 수 없어요. 사파리를 최신 버전으로 업데이트해 주세요.';
}
// 새로 올린 필름과 화면이 바로 보이게 한다 (sw.js 참고)
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
