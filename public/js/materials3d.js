const P = (o, kind = 0, defines = {}) => ({ o, kind, defines });

export const PRESETS = {
  brass: P({ color: '#c49a5a', metalness: 1, roughness: 0.2 }, 12),
  grooved: P({ color: '#c49a5a', metalness: 1, roughness: 0.3 }, 14),
  steel: P({ color: '#b4b8bd', metalness: 1, roughness: 0.26 }, 1),
  chrome: P({ color: '#eef0f2', metalness: 1, roughness: 0.045 }),
  aluminium: P({ color: '#cdd0d4', metalness: 1, roughness: 0.22 }, 1),
  spun: P({ color: '#cfd2d6', metalness: 1, roughness: 0.2 }, 2),
  foil: P({ color: '#dfe1e4', metalness: 1, roughness: 0.1, iridescence: 1, iridescenceIOR: 1.7, iridescenceThicknessRange: [250, 900], side: 2 }, 11),
  copper: P({ color: '#c47e55', metalness: 1, roughness: 0.28 }, 12),
  iron: P({ color: '#2b2b2c', metalness: 0.75, roughness: 0.5 }, 7),
  grille: P({ color: '#9a9da3', metalness: 1, roughness: 0.32 }, 10, { PERF_PITCH: '0.032', PERF_R: '0.34' }),
  lacquer: P({ color: '#0c0b0b', roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.02 }),
  resin: P({
    color: '#4a4558', roughness: 0.05, clearcoat: 1, clearcoatRoughness: 0.02, transmission: 0.88, thickness: 0.35, ior: 1.5,
    attenuationColor: '#2a2134', attenuationDistance: 0.42, specularIntensity: 1,
  }, 8, { FLAKE_FREQ: '120.0', FLAKE_P: '0.985', FLAKE_GAIN: '1.2' }),
  flake: P({ color: '#c2a06a', roughness: 0.24, clearcoat: 1, clearcoatRoughness: 0.015 }, 8, { FLAKE_FREQ: '160.0', FLAKE_P: '0.86', FLAKE_GAIN: '0.9' }),
  glass: P({ color: '#f4f7f9', roughness: 0.03, transmission: 1, thickness: 0.12, ior: 1.5 }),
  'tube-glass': P({ color: '#f4f7f9', roughness: 0.02, transmission: 1, thickness: 0.04, ior: 1.5 }),
  walnut: P({ color: '#5b3a22', roughness: 0.42, clearcoat: 0.55, clearcoatRoughness: 0.18 }, 3),
  rubber: P({ color: '#141414', roughness: 0.85 }, 12),
  paper: P({ color: '#25221e', roughness: 0.82 }, 12),
  film: P({ color: '#3a3a3f', roughness: 0.3, clearcoat: 0.4 }, 12),
  silicone: P({ color: '#36363c', roughness: 0.45, sheen: 0.5, sheenColor: '#7a7a80', transmission: 0.25, thickness: 0.2 }, 12),
  plastic: P({ color: '#f2f0eb', roughness: 0.32, clearcoat: 0.6, clearcoatRoughness: 0.1 }, 12),
  black: P({ color: '#1c1c1e', roughness: 0.4, clearcoat: 0.6, clearcoatRoughness: 0.15 }, 12),
  satin: P({ color: '#29292b', roughness: 0.48, clearcoat: 0.35, clearcoatRoughness: 0.25 }, 12),
  speckle: P({ color: '#15171c', roughness: 0.38, clearcoat: 0.45, clearcoatRoughness: 0.12 }, 13),
  felt: P({ color: '#2b2826', roughness: 1 }, 6),
  pcb: P({ color: '#17402a', roughness: 0.45, clearcoat: 0.4 }, 12),
  velour: P({ color: '#1d1c1c', roughness: 1, sheen: 1, sheenColor: '#5a5654', sheenRoughness: 0.75 }, 6),
  vinyl: P({ color: '#0b0b0b', roughness: 0.18, clearcoat: 0.9, clearcoatRoughness: 0.08 }, 9),
  label: P({ color: '#c9a464', roughness: 0.62 }, 12),
  tolex: P({ color: '#171616', roughness: 0.72 }, 4),
  leather: P({ color: '#22170f', roughness: 0.55, sheen: 0.3, sheenColor: '#5a4030' }, 4),
  cloth: P({ color: '#4a3f33', roughness: 1, sheen: 0.6, sheenColor: '#7a6650' }, 5),
  ivory: P({ color: '#ece6da', roughness: 0.4, clearcoat: 0.3 }, 12),
  ceramic: P({ color: '#eee9df', roughness: 0.3, clearcoat: 0.5 }, 12),
  enamel: P({ color: '#5b1712', metalness: 0.35, roughness: 0.32, clearcoat: 0.7, clearcoatRoughness: 0.1 }, 7),
  tape: P({ color: '#3d2615', roughness: 0.45, clearcoat: 0.3 }, 2),
  kapton: P({ color: '#c97a1e', roughness: 0.25, clearcoat: 0.7 }),
  led: P({ color: '#ff4a2a', roughness: 0.15, clearcoat: 1, emissive: '#ff2a10', emissiveIntensity: 2.2 }),
  screen: P({ color: '#a3ad98', roughness: 0.55, emissive: '#2a3324', emissiveIntensity: 0.6 }),
  'key-red': P({ color: '#d23c2a', roughness: 0.38, clearcoat: 0.5 }, 12),
  'key-orange': P({ color: '#e07b26', roughness: 0.38, clearcoat: 0.5 }, 12),
  'key-yellow': P({ color: '#e5c43a', roughness: 0.38, clearcoat: 0.5 }, 12),
  'key-white': P({ color: '#e8e4da', roughness: 0.38, clearcoat: 0.5 }, 12),
};

const GLSL = `
varying vec3 vObj;
varying vec3 vObjN;
float hh(vec3 p){p=fract(p*0.3183099+0.1);p*=17.0;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
float vn(vec3 x){vec3 i=floor(x);vec3 f=fract(x);f=f*f*(3.0-2.0*f);
return mix(mix(mix(hh(i),hh(i+vec3(1,0,0)),f.x),mix(hh(i+vec3(0,1,0)),hh(i+vec3(1,1,0)),f.x),f.y),
mix(mix(hh(i+vec3(0,0,1)),hh(i+vec3(1,0,1)),f.x),mix(hh(i+vec3(0,1,1)),hh(i+vec3(1,1,1)),f.x),f.y),f.z);}
float fbm(vec3 p){float a=0.5;float s=0.0;for(int i=0;i<4;i++){s+=a*vn(p);p*=2.03;a*=0.5;}return s;}
vec2 planeUV(vec3 p,vec3 n){vec3 a=abs(n);return a.x>a.y&&a.x>a.z?p.yz:(a.y>a.z?p.xz:p.xy);}
float fadeF(float f){return clamp(1.6-length(fwidth(vObj))*f*0.55,0.0,1.0);}
vec3 bumpN(vec3 n,float h){vec3 sx=normalize(dFdx(-vViewPosition));vec3 sy=normalize(dFdy(-vViewPosition));
vec3 r1=cross(sy,n);vec3 r2=cross(n,sx);float det=dot(sx,r1);vec3 g=sign(det)*(dFdx(h)*r1+dFdy(h)*r2);
return normalize(abs(det)*n-g);}
`;

const BODY = `
float hD=0.0;float rD=0.0;float mD=-1.0;vec3 cD=vec3(1.0);float bD=0.0;
#if DK == 1
float s1=vn(vec3(vObj.x*3.0,vObj.y*760.0,vObj.z*760.0));float s2=vn(vec3(vObj.x*1.5,vObj.y*80.0,vObj.z*80.0));
hD=s1*0.7+s2*0.3;rD=(hD-0.5)*0.12;bD=0.12*fadeF(760.0);cD=vec3(0.95+0.08*s2);
#elif DK == 2
float rr=length(vObj.xz);float s1=vn(vec3(rr*900.0,0.0,0.0));float s2=vn(vec3(rr*110.0,atan(vObj.z,vObj.x)*3.0,0.0));
hD=s1*0.8+s2*0.2;rD=(hD-0.5)*0.14;bD=0.18*fadeF(900.0);cD=vec3(0.95+0.08*s2);
#elif DK == 3
float w=fbm(vObj*vec3(3.0,0.5,3.0));float t=(vObj.x*0.7+vObj.z*0.7)*20.0+w*3.0+sin(vObj.y*2.3)*0.5;float band=smoothstep(0.0,1.0,abs(fract(t)-0.5)*2.0);
float pores=vn(vec3(vObj.x*520.0,vObj.y*30.0,vObj.z*520.0));
cD=mix(vec3(0.74,0.7,0.66),vec3(1.16,1.1,1.04),band)*(0.88+0.2*fbm(vObj*vec3(30.0,0.6,30.0)))*(0.93+0.07*pores);
hD=band*0.4+pores*0.6;rD=(0.5-band)*0.12+(pores-0.5)*0.1;bD=0.4*fadeF(520.0);
#elif DK == 4
float g=fbm(vObj*170.0);float g2=vn(vObj*38.0);hD=smoothstep(0.3,0.75,g);cD=vec3(0.82+0.3*g2);rD=(0.5-hD)*0.2;bD=1.2*fadeF(170.0);
#elif DK == 5
vec2 wuv=planeUV(vObj,vObjN)*520.0;float wv=abs(sin(wuv.x))*0.5+abs(sin(wuv.y))*0.5;float wn=fbm(vObj*40.0);
hD=wv;cD=vec3(0.68+0.42*wv)*(0.85+0.3*wn);rD=0.04;bD=0.9*fadeF(520.0);
#elif DK == 6
float vnz=fbm(vObj*300.0);float vm=fbm(vObj*12.0);hD=vnz;cD=vec3(0.75+0.35*vm)*(0.9+0.2*vnz);bD=0.5*fadeF(300.0);
#elif DK == 7
float cn=fbm(vObj*55.0);float cs=smoothstep(0.75,0.95,vn(vObj*260.0));hD=cn*0.8+cs*0.4;cD=vec3(0.82+0.3*cn-cs*0.25);rD=(cn-0.5)*0.25;bD=1.0*fadeF(260.0);
#elif DK == 8
vec3 cell=floor(vObj*FLAKE_FREQ);float fr=hh(cell);float fl=step(FLAKE_P,fr);vec3 fp=fract(vObj*FLAKE_FREQ)-0.5-(vec3(hh(cell+1.7),hh(cell+2.3),hh(cell+5.1))-0.5)*0.3;fl*=smoothstep(0.3,0.18,length(fp));
cD=mix(vec3(1.0),mix(vec3(1.7,1.3,0.7),vec3(0.75,1.15,1.6),hh(cell+3.1))*FLAKE_GAIN,fl);mD=fl;rD=-fl*0.2;
#elif DK == 9
float vr=length(vObj.xz);float vg=sin(vr*2600.0)*0.5+0.5;float tr=smoothstep(0.0,0.012,abs(fract(vr*9.0)-0.5)-0.47);
hD=vg*0.5;rD=mix(0.14,-0.06,tr)+(vg-0.5)*0.06;cD=vec3(1.0+0.7*(1.0-tr));bD=0.35*fadeF(2600.0);
#elif DK == 10
vec2 puv=planeUV(vObj,vObjN)/PERF_PITCH;vec2 hs=vec2(1.0,1.7320508);vec4 hc=floor(vec4(puv,puv-vec2(0.5,1.0))/hs.xyxy)+0.5;
vec4 hq=vec4(puv-hc.xy*hs,puv-(hc.zw+0.5)*hs);vec2 hd2=dot(hq.xy,hq.xy)<dot(hq.zw,hq.zw)?hq.xy:hq.zw;float pd=length(hd2);
if(pd<PERF_R)discard;hD=smoothstep(PERF_R,PERF_R+0.14,pd);bD=0.5;
#elif DK == 11
float cr=length(vObj.xz);hD=sin(cr*4200.0)*0.5+0.5;rD=-0.04;bD=0.2*fadeF(4200.0);
#elif DK == 12
float mn=vn(vObj*420.0);float mm=vn(vObj*25.0);hD=mn;rD=(mn-0.5)*0.1+(mm-0.5)*0.08;cD=vec3(0.95+0.1*mm);bD=0.18*fadeF(420.0);
#elif DK == 13
float sm=fbm(vObj*vec3(6.0,18.0,6.0));float ss=step(0.965,hh(floor(vObj*420.0)));
cD=vec3(0.8+0.45*sm)+vec3(0.4,0.5,0.7)*ss*1.6;rD=(sm-0.5)*0.15;hD=sm;bD=0.15;
#elif DK == 14
float gg=sin(vObj.x*700.0)*0.5+0.5;hD=gg;rD=(gg-0.5)*0.15;bD=0.5*fadeF(700.0);
#endif
diffuseColor.rgb*=cD;
`;

export function makeMaterial(T, rawName) {
  const name = rawName.split('~')[0];
  const preset = PRESETS[name] ?? P({ color: '#888888', roughness: 0.5 });
  const { iridescenceThicknessRange, side, ...o } = preset.o;
  const m = new T.MeshPhysicalMaterial(o);
  if (iridescenceThicknessRange) [m.iridescenceThicknessMinimum, m.iridescenceThicknessMaximum] = iridescenceThicknessRange;
  if (side === 2) m.side = T.DoubleSide;
  m.name = rawName;
  m.userData.baseEmissive = m.emissive.clone();
  m.userData.baseEmissiveIntensity = m.emissiveIntensity;
  if (!preset.kind) return m;
  m.defines = { ...(m.defines ?? {}), DK: preset.kind, ...preset.defines };
  m.customProgramCacheKey = () => `dk${preset.kind}${JSON.stringify(preset.defines)}`;
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = `varying vec3 vObj;\nvarying vec3 vObjN;\n${shader.vertexShader}`
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObj = position;\nvObjN = normal;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${GLSL}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${BODY}`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor=clamp(roughnessFactor+rD,0.03,1.0);')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nif(mD>=0.0)metalnessFactor=mix(metalnessFactor,1.0,mD);')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nif(bD>0.0)normal=bumpN(normal,hD*bD*0.045);');
  };
  return m;
}

export function studioEnvironment(T) {
  const s = new T.Scene();
  const room = new T.Mesh(new T.BoxGeometry(30, 18, 30), new T.MeshBasicMaterial({ color: new T.Color(0.018, 0.016, 0.014), side: T.BackSide }));
  room.position.y = 4;
  s.add(room);
  const panel = (w, h, power, pos, color = '#fff4e6') => {
    const m = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({ color: new T.Color(color).multiplyScalar(power), side: T.DoubleSide }));
    m.position.set(...pos);
    m.lookAt(0, 0, 0);
    s.add(m);
  };
  panel(9, 4, 4.2, [0.5, 10, 1.5]);
  panel(1.3, 11, 11, [-8.5, 1.5, 3.5]);
  panel(1.3, 11, 9, [8.5, 2, -1.5], '#e6eeff');
  panel(0.8, 9, 6, [-6, 1, -7], '#e6eeff');
  panel(11, 1.1, 7, [0, 3, -10]);
  panel(4, 2.4, 1.6, [3, -2.5, 9]);
  panel(2.2, 2.2, 2.5, [-5, 6, -6], '#ffd9a8');
  return s;
}
