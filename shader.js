// 필름 계산. 필름 숫자(films.js)가 화면 색으로 바뀌는 곳은 이 파일뿐이다.
//   createRenderer  같은 셰이더로 그리는 WebGL 화면을 만든다 (큰 화면과 필름 미리보기가 하나씩 쓴다)
//   applyFilm       필름 숫자를 셰이더 값으로 바꾼다. 계산식을 바꾸면 모든 필름의 느낌이 같이 바뀐다
//   drawFrame       사진이나 영상 한 장면에 지금 필름을 입혀 그린다

// 필름이 하나도 없을 때 쓰는 값. 원본 그대로 보인다.
export const NO_FILM = {
  strength: 0, exposure: 0, contrast: 0, highlights: 0, shadows: 0, temp: 0, tint: 0, saturation: 0,
  hsl: { red: [0,0,0], orange: [0,0,0], yellow: [0,0,0], green: [0,0,0], cyan: [0,0,0], blue: [0,0,0], magenta: [0,0,0] },
  splitTone: { shadow: [0,0], highlight: [0,0] }, curve: [0, 0.25, 0.5, 0.75, 1], grain: 0, vignette: 0
};

const VS = `attribute vec2 p;varying vec2 v;uniform float uMirror;
void main(){v=p*.5+.5;if(uMirror>.5)v.x=1.-v.x;gl_Position=vec4(p,0.,1.);}`;
const FS = `precision highp float;
varying vec2 v;uniform sampler2D uTex;uniform vec2 uRes;uniform float uTime;
uniform float uEv,uCf,uHi,uSh,uGs,uGrain,uVig,uStr,uSS,uHS,uPix,uLev,uBlur,uChroma,uScan,uFlash,uFlicker,uScratch,uGlow;
uniform vec3 uWb,uSC,uHC;uniform vec3 uBands[7];uniform float uCurve[5];
float cv(float x){x=clamp(x,0.,1.);
  if(x<.25)return mix(uCurve[0],uCurve[1],x*4.);
  if(x<.5)return mix(uCurve[1],uCurve[2],(x-.25)*4.);
  if(x<.75)return mix(uCurve[2],uCurve[3],(x-.5)*4.);
  return mix(uCurve[3],uCurve[4],(x-.75)*4.);}
vec3 rgb2hsl(vec3 c){float mx=max(c.r,max(c.g,c.b)),mn=min(c.r,min(c.g,c.b)),l=(mx+mn)*.5,d=mx-mn,h=0.,s=0.;
  if(d>1e-5){s=l>.5?d/(2.-mx-mn):d/(mx+mn);
    if(mx==c.r)h=(c.g-c.b)/d+(c.g<c.b?6.:0.);else if(mx==c.g)h=(c.b-c.r)/d+2.;else h=(c.r-c.g)/d+4.;h*=60.;}
  return vec3(h,s,l);}
vec3 hsl2rgb(vec3 k){float h=mod(k.x,360.)/60.,c=(1.-abs(2.*k.z-1.))*k.y,x=c*(1.-abs(mod(h,2.)-1.)),m=k.z-c*.5;vec3 r;
  if(h<1.)r=vec3(c,x,0.);else if(h<2.)r=vec3(x,c,0.);else if(h<3.)r=vec3(0.,c,x);else if(h<4.)r=vec3(0.,x,c);else if(h<5.)r=vec3(x,0.,c);else r=vec3(c,0.,x);
  return r+m;}
float bw(float h,float lo,float c,float hi){return h<c?clamp((h-lo)/(c-lo),0.,1.):clamp((hi-h)/(hi-c),0.,1.);}
float hash(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
void main(){
  vec2 uv=v;
  vec3 o;
  if(uPix>0.){
    // 도트: 칸마다 한 색. 칸 안 네 곳을 읽어 평균을 내서, 어두운 곳의 노이즈로 칸 색이 깜빡이지 않게 한다
    vec2 n=uPix*uRes/min(uRes.x,uRes.y);uv=(floor(v*n)+.5)/n;vec2 q=.25/n;
    o=(texture2D(uTex,uv+q).rgb+texture2D(uTex,uv-q).rgb+texture2D(uTex,uv+vec2(q.x,-q.y)).rgb+texture2D(uTex,uv+vec2(-q.x,q.y)).rgb)*.25;
  }else o=texture2D(uTex,uv).rgb;
  vec3 c=o;
  if(uBlur>0.){vec2 d=vec2(uBlur,0.);
    c=(texture2D(uTex,uv-2.*d).rgb+texture2D(uTex,uv-d).rgb+o+texture2D(uTex,uv+d).rgb+texture2D(uTex,uv+2.*d).rgb)/5.;}
  if(uChroma>0.){vec2 d=vec2(uChroma,0.),e=vec2(uBlur,0.);
    c.r=(texture2D(uTex,uv+d-e).r+texture2D(uTex,uv+d).r+texture2D(uTex,uv+d+e).r)/3.;
    c.b=(texture2D(uTex,uv-d-e).b+texture2D(uTex,uv-d).b+texture2D(uTex,uv-d+e).b)/3.;}
  c=c*uEv*uWb;
  c=(c-.5)*uCf+.5;
  float L=clamp(dot(c,vec3(.299,.587,.114)),0.,1.);
  c+=uHi*smoothstep(.5,1.,L)+uSh*(1.-smoothstep(0.,.5,L));
  if(uGlow>0.){
    // 빛 번짐. 톤 커브 앞에서 더해서, 번진 빛도 커브의 가장 밝은 값을 넘지 않게 한다.
    // 픽셀마다 도는 각도를 다르게 해서 겹친 자국 대신 부드러운 번짐이 되게 한다.
    // 아주 밝은 곳(창문, 눈, 조명)만 번지고 피부 같은 중간 밝기는 번지지 않는다.
    vec2 rs=vec2(min(uRes.x,uRes.y))/uRes*.02;vec3 g=vec3(0.);float rot=hash(uv*uRes)*6.2831853;
    for(int i=0;i<6;i++){float an=rot+float(i)*1.0472;
      vec3 t1=texture2D(uTex,uv+vec2(cos(an),sin(an))*rs*(.6+.4*hash(uv+float(i)))).rgb;
      vec3 t2=texture2D(uTex,uv+vec2(cos(an+.5236),sin(an+.5236))*rs*(1.4+.8*hash(uv-float(i)))).rgb;
      g+=t1*max(dot(t1,vec3(.299,.587,.114))-.78,0.)+t2*max(dot(t2,vec3(.299,.587,.114))-.78,0.);}
    c+=g/12.*4.*uGlow;}
  c=vec3(cv(c.r),cv(c.g),cv(c.b));
  vec3 k=rgb2hsl(c);float h=k.x;
  vec3 a=uBands[0]*max(bw(h,-60.,0.,30.),bw(h-360.,-60.,0.,30.))
    +uBands[1]*bw(h,0.,30.,60.)+uBands[2]*bw(h,30.,60.,120.)+uBands[3]*bw(h,60.,120.,180.)
    +uBands[4]*bw(h,120.,180.,240.)+uBands[5]*bw(h,180.,240.,300.)+uBands[6]*bw(h,240.,300.,360.);
  k.x+=a.x;
  k.y=clamp(k.y*(1.+a.y/100.)*max(uGs,1.),0.,1.);
  k.z=clamp(k.z+a.z/100.*.3*k.y,0.,1.);
  c=hsl2rgb(k);float l=k.z;
  // 채도를 낮출 때는 눈에 보이는 밝기를 지키며 회색에 가깝게 한다.
  // (색을 그냥 빼면 노랑은 실제보다 어둡게, 빨강은 실제보다 밝게 나온다)
  if(uGs<1.)c=mix(vec3(dot(c,vec3(.299,.587,.114))),c,uGs);
  c+=(uSC-.5)*(1.-l)*(1.-l)*uSS+(uHC-.5)*l*l*uHS;
  // 입자 크기는 사진 크기와 상관없이 같게: 짧은 변 1440 기준으로 칸을 묶는다
  vec2 gp=floor(uv*uRes/max(1.,min(uRes.x,uRes.y)/1440.));
  c+=(hash(gp+uTime)-.5)*uGrain*(1.-abs(2.*l-1.)*.6);
  float fn=floor(uTime*24.);
  if(uFlicker>0.)c*=1.+uFlicker*(hash(vec2(fn,3.7))-.5);
  if(uScratch>0.){
    for(int i=0;i<3;i++){float fi=float(i);
      float on=step(.45,hash(vec2(fi+1.,fn*1.3)));
      float w=.0008+.0012*hash(vec2(fn,fi+9.));
      float ln=on*(1.-smoothstep(0.,w,abs(uv.x-hash(vec2(fn,fi*7.1)))));
      c+=ln*uScratch*(hash(vec2(fi,fn))>.5?.55:-.45);}
    vec2 cell=floor(uv*vec2(uRes.x/uRes.y,1.)*90.);
    c-=step(.9985,hash(cell+fn))*uScratch*.8;}
  vec2 d=uv-.5;c*=1.+uVig*dot(d,d)*2.;
  if(uFlash>0.){float fr=length(d*vec2(uRes.x/uRes.y,1.));c*=1.+uFlash*(1.-smoothstep(0.,.7,fr));}
  if(uLev>1.5)c=floor(clamp(c,0.,1.)*(uLev-1.)+.5)/(uLev-1.);
  if(uScan>0.){float per=max(2.,min(uRes.x,uRes.y)/240.);c*=1.-uScan*(.5+.5*cos(6.2831853*gl_FragCoord.y/per));}
  gl_FragColor=vec4(mix(o,clamp(c,0.,1.),uStr),1.);
}`;
const UNIFORMS = ['uMirror','uRes','uTime','uEv','uCf','uHi','uSh','uGs','uGrain','uVig','uStr','uSS','uHS','uPix','uLev',
  'uBlur','uChroma','uScan','uFlash','uFlicker','uScratch','uGlow','uWb','uSC','uHC','uBands','uCurve'];

// 돌려주는 값 { g, u } 에서 g 는 WebGL, u 는 셰이더 값의 자리다.
// 아이폰은 앱이 뒤에 오래 있으면 WebGL 을 거둬 갈 때가 있다. 돌려받으면 처음부터 다시 준비하고 onRestore 를 부른다.
export function createRenderer(canvas, onRestore) {
  const g = canvas.getContext('webgl', { preserveDrawingBuffer: true, antialias: false });
  if (!g) throw new Error('WebGL을 쓸 수 없어요');
  const r = { g, u: {} };
  const compile = (type, src) => {
    const s = g.createShader(type); g.shaderSource(s, src); g.compileShader(s);
    if (!g.getShaderParameter(s, g.COMPILE_STATUS)) throw new Error(g.getShaderInfoLog(s));
    return s;
  };
  const setup = () => {
    const prog = g.createProgram();
    g.attachShader(prog, compile(g.VERTEX_SHADER, VS));
    g.attachShader(prog, compile(g.FRAGMENT_SHADER, FS));
    g.linkProgram(prog);
    if (!g.getProgramParameter(prog, g.LINK_STATUS)) throw new Error(g.getProgramInfoLog(prog));
    g.useProgram(prog);
    g.bindBuffer(g.ARRAY_BUFFER, g.createBuffer());
    g.bufferData(g.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), g.STATIC_DRAW);
    const loc = g.getAttribLocation(prog, 'p');
    g.enableVertexAttribArray(loc); g.vertexAttribPointer(loc, 2, g.FLOAT, false, 0, 0);
    g.bindTexture(g.TEXTURE_2D, g.createTexture());
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_S, g.CLAMP_TO_EDGE);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_T, g.CLAMP_TO_EDGE);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MIN_FILTER, g.LINEAR);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MAG_FILTER, g.LINEAR);
    g.pixelStorei(g.UNPACK_FLIP_Y_WEBGL, true);
    for (const n of UNIFORMS) r.u[n] = g.getUniformLocation(prog, n);
  };
  setup();
  canvas.addEventListener('webglcontextlost', e => e.preventDefault());
  canvas.addEventListener('webglcontextrestored', () => { try { setup(); if (onRestore) onRestore(); } catch (e) {} });
  return r;
}

function hue2rgb(h) {
  h = ((h % 360) + 360) % 360 / 60; const x = 1 - Math.abs(h % 2 - 1);
  return h < 1 ? [1,x,0] : h < 2 ? [x,1,0] : h < 3 ? [0,1,x] : h < 4 ? [0,x,1] : h < 5 ? [x,0,1] : [1,0,x];
}

// f 는 films.js 의 필름, a 는 강도(0~1). 1 이면 films.js 숫자 그대로, 0 이면 원본이다.
export function applyFilm(r, f, a = 1) {
  const { g, u } = r;
  g.uniform1f(u.uEv, Math.pow(2, f.exposure / 50));
  g.uniform1f(u.uCf, 1 + f.contrast / 100 * 0.6);
  g.uniform1f(u.uHi, f.highlights / 100 * 0.25);
  g.uniform1f(u.uSh, f.shadows / 100 * 0.25);
  g.uniform3f(u.uWb, 1 + f.temp * 0.003, 1 - f.tint * 0.002, 1 - f.temp * 0.003);
  g.uniform1f(u.uGs, 1 + f.saturation / 100);
  const h = f.hsl;
  g.uniform3fv(u.uBands, new Float32Array([].concat(h.red, h.orange, h.yellow, h.green, h.cyan, h.blue, h.magenta)));
  g.uniform1fv(u.uCurve, new Float32Array(f.curve));
  g.uniform3fv(u.uSC, hue2rgb(f.splitTone.shadow[0]));
  g.uniform3fv(u.uHC, hue2rgb(f.splitTone.highlight[0]));
  g.uniform1f(u.uSS, f.splitTone.shadow[1] / 100 * 0.5);
  g.uniform1f(u.uHS, f.splitTone.highlight[1] / 100 * 0.5);
  g.uniform1f(u.uGrain, f.grain / 100 * 0.35);
  g.uniform1f(u.uVig, f.vignette / 100 * 0.8);
  g.uniform1f(u.uStr, f.strength / 100 * a);
  // 재미 효과. 없거나 0이면 꺼진다. 강도가 낮을수록 도트는 잘아지고 색 단계는 많아진다.
  g.uniform1f(u.uPix, f.pixel && a > 0 ? 8 + (100 - f.pixel * a) * 1.6 : 0);
  g.uniform1f(u.uLev, f.levels && a > 0 ? Math.min(256, f.levels / a) : 0);
  // 비디오 느낌: 가로로 번짐, 색 어긋남, 가로 줄무늬. 강도에 비례한다.
  g.uniform1f(u.uBlur, (f.blur || 0) / 100 * 0.004 * a);
  g.uniform1f(u.uChroma, (f.chroma || 0) / 100 * 0.006 * a);
  g.uniform1f(u.uScan, (f.scan || 0) / 100 * 0.35 * a);
  // 플래시: 가운데를 밝히고 바깥으로 갈수록 빛이 줄어든다
  g.uniform1f(u.uFlash, (f.flash || 0) / 100 * 0.45 * a);
  // 옛날 영사기: 밝기가 깜빡이고, 세로 긁힘과 먼지가 프레임마다 바뀐다
  g.uniform1f(u.uFlicker, (f.flicker || 0) / 100 * 0.25 * a);
  g.uniform1f(u.uScratch, (f.scratch || 0) / 100 * a);
  // 빛 번짐: 밝은 곳이 주변으로 부드럽게 퍼진다 (주변 12곳의 밝은 부분을 더함)
  g.uniform1f(u.uGlow, (f.glow || 0) / 100 * a);
}

// src(영상, 사진, 캔버스)를 w x h 크기로, 마지막에 applyFilm 한 필름을 입혀 그린다.
// time 은 입자·깜빡임이 바뀌는 시각(0~1), mirror 가 1 이면 좌우를 뒤집는다(앞카메라).
export function drawFrame(r, src, w, h, time, mirror) {
  const { g, u } = r, cv = g.canvas;
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
  g.viewport(0, 0, w, h);
  g.texImage2D(g.TEXTURE_2D, 0, g.RGB, g.RGB, g.UNSIGNED_BYTE, src);
  g.uniform2f(u.uRes, w, h);
  g.uniform1f(u.uTime, time);
  g.uniform1f(u.uMirror, mirror);
  g.drawArrays(g.TRIANGLE_STRIP, 0, 4);
}
