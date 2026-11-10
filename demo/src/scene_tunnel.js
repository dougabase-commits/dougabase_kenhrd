// 01 — raymarched gyroid tunnel. No triangles: the whole space is one distance function.
const Tunnel = (() => {
  let gl, cv, uT, uK;
  const FS = `#version 300 es
precision highp float; out vec4 o; uniform float T, K; uniform vec2 R;
mat2 rot(float a){float c=cos(a),s=sin(a);return mat2(c,-s,s,c);}
vec2 path(float z){return vec2(sin(z*.23)*1.3+sin(z*.11)*.6,cos(z*.19));}
float gy(vec3 p){return dot(sin(p),cos(p.yzx));}
float map(vec3 p){
  vec2 c=p.xy-path(p.z); vec3 q=vec3(c*rot(p.z*.12),p.z);
  float g=abs(gy(q*1.15))/1.15-.11-.05*K;
  g=max(g,-(abs(gy(q*4.6+1.))/4.6-.04));
  return max(g,1.05-length(c))*.8;
}
vec3 nrm(vec3 p){vec2 e=vec2(.002,0);return normalize(vec3(map(p+e.xyy)-map(p-e.xyy),map(p+e.yxy)-map(p-e.yxy),map(p+e.yyx)-map(p-e.yyx)));}
void main(){
  vec2 uv=(gl_FragCoord.xy-.5*R)/R.y; float z=T*2.3+.6*K;
  vec3 ro=vec3(path(z),z), ta=vec3(path(z+1.8),z+1.8);
  vec3 f=normalize(ta-ro), r=normalize(cross(vec3(sin(T*.35)*.5,1,0),f)), u=cross(f,r), rd=normalize(f*.85+uv.x*r+uv.y*u);
  float t=0.,d=0.,glow=0.; bool hit=false;
  for(int i=0;i<100;i++){vec3 p=ro+rd*t; d=map(p); glow+=exp(-max(d,0.)*9.)*.011; if(d<.0012*t){hit=true;break;} if(t>28.)break; t+=d;}
  vec3 core=vec3(1.,.55,.32)*pow(max(dot(rd,f),0.),40.)*.8, fog=vec3(.015,.025,.06)+core, col=fog;
  if(hit){
    vec3 p=ro+rd*t, n=nrm(p);
    float m=smoothstep(-.7,.7,sin(p.z*.33+gy(p*.5)*1.3));
    vec3 base=mix(vec3(1.,.33,.18),vec3(.12,.36,1.),m);
    vec3 l=normalize(ro+f*2.5-p); float dif=max(dot(n,l),0.), spe=pow(max(dot(reflect(-l,n),-rd),0.),32.);
    float ao=clamp(.35+map(p+n*.18)/.18*.65,0.,1.), fre=pow(1.-max(dot(n,-rd),0.),3.);
    float ring=smoothstep(.93,1.,sin(p.z*1.1-T*7.))*(.6+1.4*K);
    float att=1./(1.+t*t*.12);
    col=base*(.03+dif*.9*att)*ao+spe*.5*ao*att+fre*vec3(.2,.4,1.)*.18*ao+base.bgr*ring*1.5+vec3(1.,.8,.6)*ring*.4;
    col=mix(fog,col,exp(-t*.16));
  }
  col+=vec3(1.,.45,.25)*glow*(.10+.25*K);
  col=col/(1.+col*.6); col=mix(col,col*col*(3.-2.*col),.6); col=pow(col,vec3(.4545));
  o=vec4(col,1.);
}`;
  function init() {
    cv = mk(); gl = cv.getContext('webgl2', { antialias: false, preserveDrawingBuffer: true });
    const sh = (ty, src) => { const s = gl.createShader(ty); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    const p = gl.createProgram(); gl.attachShader(p, sh(gl.VERTEX_SHADER, '#version 300 es\nin vec2 p;void main(){gl_Position=vec4(p,0,1);}')); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(p); gl.useProgram(p);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    uT = gl.getUniformLocation(p, 'T'); uK = gl.getUniformLocation(p, 'K'); gl.uniform2f(gl.getUniformLocation(p, 'R'), W, H);
  }
  function draw(ctx, f) {
    const lf = f - 240; gl.uniform1f(uT, lf / FPS + 3); gl.uniform1f(uK, kick(f)); gl.drawArrays(gl.TRIANGLES, 0, 3); gl.finish();
    ctx.drawImage(cv, 0, 0); flash(ctx, lf);
    caption(ctx, lf, 240, '01', CAP_EN, CAP_JP); post(ctx, f, { bloom: .5 });
  }
  const CAP_EN = tx('REALTIME 3D — GLSL RAYMARCHING'), CAP_JP = tx('ポリゴンゼロ。数式だけで描く空間。');
  return { init, draw, label: tx('01 / RAYMARCHING') };
})();
