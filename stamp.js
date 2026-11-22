// 날짜 도장: 오른쪽 아래에 디지털 글씨로 시간과 날짜를 찍는다.
// 화면(미리보기)과 저장한 사진에 같은 크기, 같은 자리로 들어간다. 필름의 stamp: 'date' 로 켠다.
// soft 가 참이면(stampStyle: 'soft') 흰색으로 작고 흐릿하게, 아니면 주황색으로 또렷하게.
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const FONT = 'bold 8px Menlo, "Courier New", monospace', FS = 8;

export function drawStamp(ctx, W, H, soft) {
  const d = new Date(), h = d.getHours();
  const lines = [`${h < 12 ? 'AM' : 'PM'} ${h % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')}`,
                 `${MONTHS[d.getMonth()]}. ${d.getDate()} ${d.getFullYear()}`];
  // 작은 캔버스에 8px 글씨로 쓴 뒤 계단지게 키워서 옛날 디지털 글씨처럼 만든다
  const s = document.createElement('canvas'), x = s.getContext('2d');
  x.font = FONT;
  s.width = Math.ceil(Math.max(...lines.map(l => x.measureText(l).width))) + 2; s.height = FS * 2 + 5;
  x.font = FONT; x.textAlign = 'right'; x.textBaseline = 'top';   // 크기를 바꾸면 글씨 설정이 지워져서 다시 넣는다
  lines.forEach((l, i) => {
    x.fillStyle = soft ? 'rgba(0,0,0,.18)' : 'rgba(90,30,0,.7)'; x.fillText(l, s.width - 1, i * (FS + 2) + 2);
    x.fillStyle = soft ? 'rgba(255,255,255,.8)' : '#ffb43a'; x.fillText(l, s.width - 2, i * (FS + 2) + 1);
  });
  // 흐릿한 도장은 작은 글씨를 부드럽게 늘려서 번진 듯 보이게 한다
  const k = (Math.min(W, H) * (soft ? 0.04 : 0.05)) / FS, m = Math.min(W, H) * 0.06;
  ctx.save(); ctx.imageSmoothingEnabled = !!soft;
  ctx.drawImage(s, W - m - s.width * k, H - m - s.height * k, s.width * k, s.height * k);
  ctx.restore();
}
