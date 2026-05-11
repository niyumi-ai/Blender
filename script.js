// ============================================================
// MOTIONSCRIPT 3D ENGINE — Complete Implementation
// Features: 100+ | Landscape-locked | Fully functional
// ============================================================

'use strict';

// ── ORIENTATION LOCK ──────────────────────────────────────
class OrientationManager {
  constructor() {
    this.overlay = document.getElementById('rotateOverlay');
    this.app = document.getElementById('app');
    window.addEventListener('resize', () => this.check());
    window.addEventListener('orientationchange', () => setTimeout(() => this.check(), 200));
    this.check();
  }
  check() {
    const portrait = window.innerHeight > window.innerWidth;
    this.overlay.style.display = portrait ? 'flex' : 'none';
    this.app.style.display = portrait ? 'none' : 'flex';
  }
}

// ── COMPLETE DSL PARSER ───────────────────────────────────
class CommandParser {
  parse(src) {
    const result = { scene:{}, objects:{}, lights:{}, groups:{}, camera:{}, animations:[] };
    const blockRx = /(scene|object|light|camera|animate|group)\s+(\w+)?\s*\{([\s\S]*?)\}/g;
    let m;
    while ((m = blockRx.exec(src)) !== null) {
      const [,type, id='default', body] = m;
      switch(type) {
        case 'scene':    result.scene = this._props(body); break;
        case 'object':   result.objects[id] = this._props(body); break;
        case 'light':    result.lights[id] = this._props(body); break;
        case 'camera':   result.camera = this._props(body); break;
        case 'group':    result.groups[id] = this._group(body); break;
        case 'animate':  result.animations.push(this._anim(id, body)); break;
      }
    }
    return result;
  }

  _props(body) {
    const p = {};
    body.split('\n').forEach(line => {
      line = line.split('//')[0].trim();
      if (!line) return;
      const ci = line.indexOf(':');
      if (ci < 0) return;
      const k = line.slice(0, ci).trim();
      const v = line.slice(ci+1).trim();
      p[k] = this._val(v);
    });
    return p;
  }

  _val(v) {
    if (v === 'true' || v === 'on') return true;
    if (v === 'false' || v === 'off') return false;
    if (/^-?\d+\.?\d*s$/.test(v)) return parseFloat(v);
    if (v.includes(',')) {
      const parts = v.split(',').map(p => parseFloat(p.trim()));
      return { x: parts[0]||0, y: parts[1]||0, z: parts[2]||0 };
    }
    if (!isNaN(v) && v !== '') return parseFloat(v);
    return v.replace(/^["']|["']$/g, '');
  }

  _group(body) {
    const g = { objects:{} };
    const rx = /object\s+(\w+)\s*\{([\s\S]*?)\}/g; let m;
    while ((m = rx.exec(body)) !== null) g.objects[m[1]] = this._props(m[2]);
    return g;
  }

  _anim(target, body) {
    const anim = { target, keyframes:[], easing:'linear', loop:false, pingpong:false, speed:1, delay:0 };
    body.split('\n').forEach(line => {
      line = line.split('//')[0].trim(); if (!line) return;
      const kfm = line.match(/at\s+([\d.]+)s\s*->\s*(\w+):\s*(.+)/);
      if (kfm) {
        anim.keyframes.push({ time: parseFloat(kfm[1]), property: kfm[2], value: this._val(kfm[3].trim()) });
      }
      if (line.startsWith('easing:')) anim.easing = line.split(':')[1].trim();
      if (line.startsWith('loop:')) anim.loop = line.split(':')[1].trim() === 'true';
      if (line.startsWith('pingpong:')) anim.pingpong = line.split(':')[1].trim() === 'true';
      if (line.startsWith('speed:')) anim.speed = parseFloat(line.split(':')[1]);
      if (line.startsWith('delay:')) anim.delay = parseFloat(line.split(':')[1]);
    });
    anim.keyframes.sort((a,b) => a.time - b.time);
    return anim;
  }
}

// ── OBJECT FACTORY ────────────────────────────────────────
class ObjectFactory {
  static MATERIAL_PRESETS = {
    metal:   { metalness:1,    roughness:0.1,  color:'#aaaaaa' },
    glass:   { metalness:0,    roughness:0,    color:'#88ccff', opacity:0.3, transparent:true },
    plastic: { metalness:0.1,  roughness:0.7,  color:'#ff4444' },
    neon:    { metalness:0.8,  roughness:0.2,  intensity:3 },
    matte:   { metalness:0,    roughness:1,    color:'#888888' },
    mirror:  { metalness:1,    roughness:0,    color:'#ffffff' },
  };

  static create(type, props={}) {
    const seg = props.segments || 32;
    let geo;
    switch(type) {
      case 'sphere':      geo = new THREE.SphereGeometry(1, seg, seg); break;
      case 'cube': case 'box': geo = new THREE.BoxGeometry(1,1,1,seg>8?2:1,seg>8?2:1,seg>8?2:1); break;
      case 'cylinder':    geo = new THREE.CylinderGeometry(.5,.5,1,seg); break;
      case 'cone':        geo = new THREE.ConeGeometry(.5,1,seg); break;
      case 'plane':       geo = new THREE.PlaneGeometry(10,10,seg,seg); break;
      case 'torus':       geo = new THREE.TorusGeometry(1,.4,16,seg); break;
      case 'torusKnot':   geo = new THREE.TorusKnotGeometry(.8,.3,128,16); break;
      case 'dodecahedron':geo = new THREE.DodecahedronGeometry(1,0); break;
      case 'icosahedron': geo = new THREE.IcosahedronGeometry(1,0); break;
      case 'ring':        geo = new THREE.RingGeometry(.5,1,seg); break;
      default:            geo = new THREE.SphereGeometry(1,seg,seg);
    }

    // Apply preset if given
    let p = {...props};
    if (p.material && ObjectFactory.MATERIAL_PRESETS[p.material]) {
      p = { ...ObjectFactory.MATERIAL_PRESETS[p.material], ...p };
    }

    const matProps = {
      color:             new THREE.Color(p.color || '#ffffff'),
      emissive:          new THREE.Color(p.emissive || '#000000'),
      emissiveIntensity: p.intensity || 0,
      metalness:         p.metalness !== undefined ? p.metalness : 0.5,
      roughness:         p.roughness !== undefined ? p.roughness : 0.5,
      flatShading:       p.shading === 'flat',
      wireframe:         !!p.wireframe,
      transparent:       !!p.transparent || (p.opacity !== undefined && p.opacity < 1),
      opacity:           p.opacity !== undefined ? p.opacity : 1,
      side:              p.side === 'double' ? THREE.DoubleSide : THREE.FrontSide,
    };

    const mat = new THREE.MeshStandardMaterial(matProps);
    if (p.shading === 'smooth' || !p.shading) geo.computeVertexNormals();

    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = props._id || 'object';
    if (p.position) mesh.position.set(p.position.x, p.position.y, p.position.z);
    if (p.scale)    mesh.scale.set(p.scale.x, p.scale.y, p.scale.z);
    if (p.rotation) mesh.rotation.set(p.rotation.x*Math.PI/180, p.rotation.y*Math.PI/180, p.rotation.z*Math.PI/180);
    mesh.castShadow = p.castShadow !== false;
    mesh.receiveShadow = p.receiveShadow !== false;
    if (p.visible === false) mesh.visible = false;
    return mesh;
  }

  static createLight(type, props={}) {
    const col = new THREE.Color(props.color || '#ffffff');
    const int = props.intensity !== undefined ? props.intensity : 1;
    let light;
    switch(type) {
      case 'directional':
        light = new THREE.DirectionalLight(col, int);
        light.castShadow = props.shadow !== false;
        if (light.castShadow) {
          light.shadow.mapSize.set(props.shadowResolution||2048, props.shadowResolution||2048);
          light.shadow.camera.near = .5; light.shadow.camera.far = 500;
          light.shadow.camera.left = light.shadow.camera.bottom = -50;
          light.shadow.camera.right = light.shadow.camera.top = 50;
        }
        break;
      case 'point':
        light = new THREE.PointLight(col, int, props.distance||100, props.decay||2);
        light.castShadow = props.shadow !== false;
        break;
      case 'spot':
        light = new THREE.SpotLight(col, int);
        light.angle = (props.angle||45)*Math.PI/180;
        light.penumbra = props.penumbra || .1;
        light.castShadow = props.shadow !== false;
        break;
      case 'ambient':
        light = new THREE.AmbientLight(col, int);
        break;
      case 'hemisphere':
        light = new THREE.HemisphereLight(col, new THREE.Color(props.groundColor||'#222244'), int);
        break;
      default:
        light = new THREE.DirectionalLight(col, int);
    }
    if (props.position && light.position) light.position.set(props.position.x, props.position.y, props.position.z);
    return light;
  }
}

// ── EASING FUNCTIONS ─────────────────────────────────────
const Easing = {
  linear:          t => t,
  easeIn:          t => t*t,
  easeOut:         t => t*(2-t),
  easeInOut:       t => t<.5 ? 2*t*t : -1+(4-2*t)*t,
  easeInCubic:     t => t*t*t,
  easeOutCubic:    t => (--t)*t*t+1,
  easeInOutCubic:  t => t<.5 ? 4*t*t*t : (t-1)*(2*t-2)*(2*t-2)+1,
  easeInBack:      t => { const c=1.70158; return (c+1)*t*t*t-c*t*t; },
  easeOutBack:     t => { const c=1.70158; return 1+(c+1)*Math.pow(t-1,3)+c*Math.pow(t-1,2); },
  easeInOutBack:   t => { const c=1.70158*1.525; return t<.5?(Math.pow(2*t,2)*((c+1)*2*t-c))/2:(Math.pow(2*t-2,2)*((c+1)*(t*2-2)+c)+2)/2; },
  easeInBounce:    t => 1-Easing.easeOutBounce(1-t),
  easeOutBounce:   t => {
    const n=7.5625, d=2.75;
    if(t<1/d) return n*t*t;
    if(t<2/d) return n*(t-=1.5/d)*t+.75;
    if(t<2.5/d) return n*(t-=2.25/d)*t+.9375;
    return n*(t-=2.625/d)*t+.984375;
  },
  easeInOutBounce: t => t<.5?(1-Easing.easeOutBounce(1-2*t))/2:(1+Easing.easeOutBounce(2*t-1))/2,
  easeInElastic:   t => { if(t===0||t===1) return t; const c=2*Math.PI/3; return -Math.pow(2,10*t-10)*Math.sin((t*10-10.75)*c); },
  easeOutElastic:  t => { if(t===0||t===1) return t; const c=2*Math.PI/3; return Math.pow(2,-10*t)*Math.sin((t*10-.75)*c)+1; },
};

// ── ANIMATION ENGINE ──────────────────────────────────────
class AnimationEngine {
  constructor() {
    this.time = 0; this.duration = 8; this.playing = false; this.loop = true;
    this.animations = []; this.objects = new Map(); this.camera = null;
    this._pingpongDir = 1;
  }

  load(animations, objects, camera) {
    this.animations = animations; this.objects = objects; this.camera = camera;
  }

  play()  { this.playing = true; }
  pause() { this.playing = false; }
  reset() { this.time = 0; this.playing = false; this._pingpongDir = 1; this._applyAll(); }

  seek(t) { this.time = Math.max(0, Math.min(t, this.duration)); this._applyAll(); }

  update(dt) {
    if (!this.playing) return;
    this.time += dt;
    if (this.time >= this.duration) {
      if (this.loop) { this.time = this.time % this.duration; }
      else { this.time = this.duration; this.playing = false; }
    }
    this._applyAll();
  }

  _applyAll() {
    this.animations.forEach(anim => this._applyAnim(anim));
  }

  _applyAnim(anim) {
    const target = anim.target === 'camera' || anim.target === 'main'
      ? this.camera
      : this.objects.get(anim.target)?.mesh;
    if (!target) return;

    const byProp = {};
    anim.keyframes.forEach(kf => {
      (byProp[kf.property] = byProp[kf.property]||[]).push(kf);
    });

    Object.entries(byProp).forEach(([prop, kfs]) => {
      const val = this._interpolate(kfs, anim.easing);
      if (val === null) return;
      if (prop === 'position' && val.x !== undefined) target.position.set(val.x, val.y, val.z);
      else if (prop === 'rotation' && val.x !== undefined) target.rotation.set(val.x*Math.PI/180, val.y*Math.PI/180, val.z*Math.PI/180);
      else if (prop === 'scale' && val.x !== undefined) target.scale.set(val.x, val.y, val.z);
      else if (prop === 'lookAt' && val.x !== undefined) target.lookAt(val.x, val.y, val.z);
      else if (prop === 'intensity' && target.material) target.material.emissiveIntensity = val;
    });
  }

  _interpolate(kfs, easing) {
    if (!kfs.length) return null;
    if (kfs.length === 1) return kfs[0].value;
    let p = kfs[0], n = kfs[kfs.length-1];
    for (let i=0; i<kfs.length-1; i++) {
      if (this.time >= kfs[i].time && this.time <= kfs[i+1].time) { p=kfs[i]; n=kfs[i+1]; break; }
    }
    if (this.time <= p.time) return p.value;
    if (this.time >= n.time) return n.value;
    const d = n.time - p.time, e = this.time - p.time;
    let t = d > 0 ? e/d : 0;
    t = (Easing[easing] || Easing.linear)(t);
    if (typeof p.value === 'object' && p.value?.x !== undefined)
      return { x: p.value.x+(n.value.x-p.value.x)*t, y: p.value.y+(n.value.y-p.value.y)*t, z: p.value.z+(n.value.z-p.value.z)*t };
    return typeof p.value === 'number' ? p.value+(n.value-p.value)*t : p.value;
  }
}

// ── THREE.JS ENGINE CORE ──────────────────────────────────
class Engine3D {
  constructor(canvas) {
    this.canvas = canvas;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(75, 1, .1, 2000);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias:true, preserveDrawingBuffer:true });
    this.controls = null;
    this.gridHelper = null; this.axesHelper = null; this.groundMesh = null;
    this.showGrid = true; this.showAxes = true;
    this._init();
  }

  _init() {
    this.camera.position.set(0,5,10);
    this.camera.lookAt(0,0,0);
    const r = this.renderer;
    r.setPixelRatio(Math.min(window.devicePixelRatio,2));
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1;

    // Orbit controls
    if (typeof THREE.OrbitControls !== 'undefined') {
      this.controls = new THREE.OrbitControls(this.camera, this.canvas);
      this.controls.enableDamping = true;
      this.controls.dampingFactor = .05;
      this.controls.screenSpacePanning = false;
      this.controls.minDistance = .5;
      this.controls.maxDistance = 500;
    }

    this._createGrid();
    this._resize();
    window.addEventListener('resize', () => this._resize());
  }

  _createGrid() {
    this.gridHelper = new THREE.GridHelper(200,200, 0x00d9ff, 0x252d3a);
    this.gridHelper.material.opacity = .18;
    this.gridHelper.material.transparent = true;
    this.scene.add(this.gridHelper);
    this.axesHelper = new THREE.AxesHelper(100);
    this.scene.add(this.axesHelper);
  }

  _resize() {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (!w || !h) return;
    this.camera.aspect = w/h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  toggleGrid(on) { this.showGrid = on; if(this.gridHelper) this.gridHelper.visible = on; }
  toggleAxes(on) { this.showAxes = on; if(this.axesHelper) this.axesHelper.visible = on; }
  toggleShadows(on) { this.renderer.shadowMap.enabled = on; }

  setBackground(color) { this.scene.background = new THREE.Color(color); }

  setFog(on, color='#1a1f3a', density=.02) {
    this.scene.fog = on ? new THREE.FogExp2(new THREE.Color(color), density) : null;
  }

  addGround(color='#1a1a1a') {
    if (this.groundMesh) this.scene.remove(this.groundMesh);
    const geo = new THREE.PlaneGeometry(500,500);
    const mat = new THREE.MeshStandardMaterial({ color:new THREE.Color(color), roughness:1, metalness:0 });
    this.groundMesh = new THREE.Mesh(geo, mat);
    this.groundMesh.rotation.x = -Math.PI/2;
    this.groundMesh.receiveShadow = true;
    this.scene.add(this.groundMesh);
  }

  removeGround() { if(this.groundMesh) { this.scene.remove(this.groundMesh); this.groundMesh=null; } }

  clearObjects() {
    const toRemove = [];
    this.scene.traverse(obj => {
      if (obj === this.gridHelper || obj === this.axesHelper || obj === this.groundMesh || obj === this.camera) return;
      if (obj.isMesh || obj.isLight) toRemove.push(obj);
    });
    toRemove.forEach(obj => {
      obj.geometry?.dispose();
      if (obj.material) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        mats.forEach(m => { m.map?.dispose(); m.dispose(); });
      }
      obj.parent?.remove(obj);
    });
  }

  render() {
    if (this.controls) this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}

// ── SCENE STATE ───────────────────────────────────────────
class SceneState {
  constructor() { this.reset(); }
  reset() {
    this.objects = new Map();
    this.lights  = new Map();
    this.animations = [];
    this.settings = { duration:8, loop:true, background:'#0a0e14', fog:false, fogColor:'#1a1f3a', fogDensity:.02, bloom:false, bloomStrength:.7, ground:false };
    this.camState = { position:{x:0,y:5,z:10}, lookAt:{x:0,y:0,z:0}, fov:75 };
    this._counter = 0;
  }
  nextId(prefix) { return `${prefix}_${++this._counter}`; }
  addObject(id, mesh, def) { this.objects.set(id, { mesh, def:{...def, _id:id} }); }
  addLight(id, light, def) { this.lights.set(id, { light, def:{...def, _id:id} }); }
  removeObject(id) { this.objects.delete(id); }
  removeLight(id) { this.lights.delete(id); }
}

// ── CODE SYNC ─────────────────────────────────────────────
class CodeSync {
  constructor(editor, state) {
    this.editor = editor; this.state = state;
  }

  generate() {
    const s = this.state.settings;
    const cam = this.state.camState;
    let code = `scene {\n    duration: ${s.duration}s\n    loop: ${s.loop}\n    background: ${s.background}\n`;
    if (s.fog) code += `    fog: on\n    fogColor: ${s.fogColor}\n    fogDensity: ${s.fogDensity}\n`;
    if (s.bloom) code += `    bloom: on\n    bloomStrength: ${s.bloomStrength}\n`;
    if (s.ground) code += `    ground: on\n`;
    code += `}\n\n`;

    this.state.objects.forEach((obj, id) => {
      const d = obj.def;
      const m = obj.mesh;
      code += `object ${id} {\n`;
      code += `    type: ${d.type||'sphere'}\n`;
      code += `    position: ${m.position.x.toFixed(2)},${m.position.y.toFixed(2)},${m.position.z.toFixed(2)}\n`;
      code += `    rotation: ${(m.rotation.x*180/Math.PI).toFixed(1)},${(m.rotation.y*180/Math.PI).toFixed(1)},${(m.rotation.z*180/Math.PI).toFixed(1)}\n`;
      code += `    scale: ${m.scale.x.toFixed(2)},${m.scale.y.toFixed(2)},${m.scale.z.toFixed(2)}\n`;
      const mat = m.material;
      if (mat) {
        code += `    color: #${mat.color.getHexString()}\n`;
        if (mat.emissive && mat.emissiveIntensity > 0) {
          code += `    emissive: #${mat.emissive.getHexString()}\n`;
          code += `    intensity: ${mat.emissiveIntensity.toFixed(1)}\n`;
        }
        code += `    metalness: ${mat.metalness.toFixed(2)}\n`;
        code += `    roughness: ${mat.roughness.toFixed(2)}\n`;
        if (mat.opacity < 1) code += `    opacity: ${mat.opacity.toFixed(2)}\n`;
        if (mat.wireframe) code += `    wireframe: true\n`;
      }
      code += `}\n\n`;
    });

    this.state.lights.forEach((lg, id) => {
      const d = lg.def; const l = lg.light;
      code += `light ${id} {\n`;
      code += `    type: ${d.type||'directional'}\n`;
      if (l.position) code += `    position: ${l.position.x.toFixed(1)},${l.position.y.toFixed(1)},${l.position.z.toFixed(1)}\n`;
      code += `    color: #${l.color.getHexString()}\n`;
      code += `    intensity: ${l.intensity.toFixed(2)}\n`;
      code += `}\n\n`;
    });

    code += `camera main {\n`;
    code += `    position: ${cam.position.x.toFixed(1)},${cam.position.y.toFixed(1)},${cam.position.z.toFixed(1)}\n`;
    code += `    lookAt: ${cam.lookAt.x.toFixed(1)},${cam.lookAt.y.toFixed(1)},${cam.lookAt.z.toFixed(1)}\n`;
    code += `    fov: ${cam.fov}\n}\n\n`;

    this.state.animations.forEach(anim => {
      code += `animate ${anim.target} {\n`;
      anim.keyframes.forEach(kf => {
        const v = typeof kf.value === 'object' && kf.value.x !== undefined
          ? `${kf.value.x},${kf.value.y},${kf.value.z}`
          : kf.value;
        code += `    at ${kf.time}s -> ${kf.property}: ${v}\n`;
      });
      code += `    easing: ${anim.easing}\n}\n\n`;
    });

    return code;
  }

  update() {
    this.editor.value = this.generate();
    app?.updateLineNumbers();
  }
}

// ── RECORDING SYSTEM ──────────────────────────────────────
class Recorder {
  constructor(canvas) {
    this.canvas = canvas; this.mr = null; this.chunks = []; this.active = false;
  }
  start(fps=30) {
    if (this.active) return;
    const stream = this.canvas.captureStream(fps);
    const mime = ['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm','video/mp4']
      .find(t => MediaRecorder.isTypeSupported(t)) || '';
    this.chunks = [];
    this.mr = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8_000_000 });
    this.mr.ondataavailable = e => { if(e.data.size>0) this.chunks.push(e.data); };
    this.mr.onstop = () => this._save();
    this.mr.start(100);
    this.active = true;
  }
  stop() { if(this.mr && this.active) { this.mr.stop(); this.active = false; } }
  _save() {
    const blob = new Blob(this.chunks, { type: this.chunks[0]?.type||'video/webm' });
    const a = Object.assign(document.createElement('a'), { href:URL.createObjectURL(blob), download:`animation_${Date.now()}.webm` });
    a.click(); URL.revokeObjectURL(a.href);
  }
  exportPNG(canvas) {
    const a = Object.assign(document.createElement('a'), { href:canvas.toDataURL('image/png'), download:`frame_${Date.now()}.png` });
    a.click();
  }
}

// ── TIMELINE RENDERER ─────────────────────────────────────
class TimelineUI {
  constructor(canvas, labelsEl) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d');
    this.labelsEl = labelsEl; this.zoom = 1;
  }
  draw(animations, currentTime, duration) {
    const { canvas: cv, ctx } = this;
    cv.width = cv.offsetWidth; cv.height = cv.offsetHeight;
    if (!cv.width || !cv.height) return;
    const W = cv.width, H = cv.height, pad = 4;
    ctx.clearRect(0,0,W,H);

    // Background
    ctx.fillStyle = '#0d1117'; ctx.fillRect(0,0,W,H);

    // Time ruler
    const secW = (W/(duration||1)) * this.zoom;
    ctx.fillStyle = '#252d3a';
    for (let s=0; s<=duration; s+=.5) {
      const x = (s/duration)*W;
      ctx.fillRect(x, 0, 1, s%1===0?12:6);
      if (s%1===0) {
        ctx.fillStyle = '#52596a'; ctx.font = '9px JetBrains Mono,monospace';
        ctx.fillText(s+'s', x+2, 10);
        ctx.fillStyle = '#252d3a';
      }
    }

    // Tracks
    const trackH = Math.max(18, (H-14) / Math.max(animations.length,1));
    animations.forEach((anim, i) => {
      const y = 14 + i*trackH;
      ctx.fillStyle = i%2===0 ? 'rgba(26,32,48,.6)' : 'rgba(19,25,32,.6)';
      ctx.fillRect(0, y, W, trackH-1);

      // Keyframe markers
      const propColors = { position:'#00d9ff', rotation:'#ff0080', scale:'#00e676', color:'#ffc107' };
      const kfByProp = {};
      anim.keyframes.forEach(kf => {
        const prop = kf.property;
        if (!kfByProp[prop]) kfByProp[prop] = [];
        kfByProp[prop].push(kf);
      });

      let propRow = 0;
      Object.entries(kfByProp).forEach(([prop, kfs]) => {
        const color = propColors[prop] || '#8a93a8';
        const ky = y + pad + propRow*(trackH/Object.keys(kfByProp).length);
        // Track bar
        if (kfs.length >= 2) {
          const x1 = (kfs[0].time/duration)*W;
          const x2 = (kfs[kfs.length-1].time/duration)*W;
          ctx.fillStyle = color+'22';
          ctx.fillRect(x1, ky, x2-x1, 6);
        }
        // Keyframe diamonds
        kfs.forEach(kf => {
          const kx = (kf.time/duration)*W;
          ctx.fillStyle = color;
          ctx.beginPath(); ctx.moveTo(kx,ky); ctx.lineTo(kx+4,ky+3); ctx.lineTo(kx,ky+6); ctx.lineTo(kx-4,ky+3); ctx.closePath();
          ctx.fill();
        });
        propRow++;
      });
    });

    // Playhead
    const px = (currentTime/duration)*W;
    ctx.strokeStyle = '#ffc107'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(px,0); ctx.lineTo(px,H); ctx.stroke();
    ctx.fillStyle = '#ffc107';
    ctx.beginPath(); ctx.moveTo(px-5,0); ctx.lineTo(px+5,0); ctx.lineTo(px,8); ctx.closePath();
    ctx.fill();
  }

  updateLabels(animations) {
    const el = this.labelsEl; el.innerHTML = '';
    const items = [{ name:'Camera', type:'camera' }, ...animations.map(a => ({ name:a.target, type:'anim' }))];
    items.forEach(item => {
      const d = document.createElement('div');
      d.className = 'tl-label';
      d.textContent = item.name;
      el.appendChild(d);
    });
  }
}

// ── RAYCASTER FOR OBJECT SELECTION ───────────────────────
class Selector {
  constructor(engine3d, state) {
    this.engine = engine3d; this.state = state;
    this.raycaster = new THREE.Raycaster();
    this.selected = null;
    this._outlineMesh = null;
  }

  pick(event) {
    const rect = this.engine.canvas.getBoundingClientRect();
    const x = ((event.clientX-rect.left)/rect.width)*2-1;
    const y = -((event.clientY-rect.top)/rect.height)*2+1;
    const mouse = new THREE.Vector2(x, y);
    this.raycaster.setFromCamera(mouse, this.engine.camera);

    const meshes = [];
    this.state.objects.forEach(obj => { if(obj.mesh.visible) meshes.push(obj.mesh); });
    const hits = this.raycaster.intersectObjects(meshes, true);
    if (hits.length) {
      let target = hits[0].object;
      while (target.parent && !this.state.objects.has(target.name)) target = target.parent;
      return target.name || null;
    }
    return null;
  }

  select(id) {
    this.clearOutline();
    this.selected = id;
    if (!id) return;
    const obj = this.state.objects.get(id);
    if (!obj) return;
    // Add wireframe outline
    const outGeo = obj.mesh.geometry.clone();
    const outMat = new THREE.MeshBasicMaterial({ color:0x00d9ff, wireframe:true, transparent:true, opacity:.4 });
    this._outlineMesh = new THREE.Mesh(outGeo, outMat);
    obj.mesh.add(this._outlineMesh);
  }

  clearOutline() {
    if (this._outlineMesh) {
      this._outlineMesh.parent?.remove(this._outlineMesh);
      this._outlineMesh.geometry?.dispose();
      this._outlineMesh.material?.dispose();
      this._outlineMesh = null;
    }
    this.selected = null;
  }
}

// ── CONSOLE LOGGER ────────────────────────────────────────
class ConsoleUI {
  constructor(bodyEl, panelEl) { this.body = bodyEl; this.panel = panelEl; }
  _log(msg, type) {
    const d = document.createElement('div');
    d.className = `con-msg ${type}`;
    d.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
    this.body.appendChild(d);
    this.body.scrollTop = this.body.scrollHeight;
    this.panel.style.display = 'flex';
    setTimeout(() => { if(type==='success') this.panel.style.display='none'; }, 4000);
  }
  info(m)    { this._log(m,'info'); }
  success(m) { this._log(m,'success'); }
  warn(m)    { this._log(m,'warn'); }
  error(m)   { this._log(m,'error'); }
  clear()    { this.body.innerHTML=''; }
}

// ── EXAMPLE PRESETS ───────────────────────────────────────
const EXAMPLES = {
bouncing: `scene {
    duration: 3s
    loop: true
    background: #0a0e14
    bloom: on
    bloomStrength: 1.2
}

object ball {
    type: sphere
    position: 0,5,0
    scale: 1,1,1
    color: #ff00ff
    emissive: #ff00ff
    intensity: 3
    metalness: 0.8
    roughness: 0.2
    segments: 48
}

object ground {
    type: plane
    position: 0,0,0
    rotation: -90,0,0
    scale: 2,10,1
    color: #1a1a2e
    roughness: 0.9
    receiveShadow: true
}

light sun {
    type: directional
    position: 5,10,5
    intensity: 2
    color: #ffffff
    shadow: true
}

light fill {
    type: ambient
    intensity: 0.3
    color: #4488ff
}

camera main {
    position: 0,4,10
    lookAt: 0,2,0
    fov: 65
}

animate ball {
    at 0s -> position: 0,5,0
    at 0.5s -> position: 0,0.5,0
    at 1s -> position: 0,5,0
    at 1.5s -> position: 0,0.5,0
    at 2s -> position: 0,5,0
    at 2.5s -> position: 0,0.5,0
    at 3s -> position: 0,5,0
    easing: easeInOut
}

animate ball {
    at 0s -> scale: 1,1,1
    at 0.5s -> scale: 1.3,0.7,1.3
    at 1s -> scale: 1,1,1
    at 1.5s -> scale: 1.3,0.7,1.3
    at 2s -> scale: 1,1,1
    at 2.5s -> scale: 1.3,0.7,1.3
    at 3s -> scale: 1,1,1
    easing: easeInOut
}`,

neon: `scene {
    duration: 4s
    loop: true
    background: #000000
    bloom: on
    bloomStrength: 1.8
}

object cube1 {
    type: cube
    position: -2.5,0,0
    color: #00d9ff
    emissive: #00d9ff
    intensity: 3
    metalness: 0.9
    roughness: 0.1
}

object cube2 {
    type: torus
    position: 0,0,0
    color: #ff0080
    emissive: #ff0080
    intensity: 3
    metalness: 0.8
    roughness: 0.1
}

object cube3 {
    type: icosahedron
    position: 2.5,0,0
    color: #7c3aed
    emissive: #7c3aed
    intensity: 3
    metalness: 0.7
    roughness: 0.2
}

light key {
    type: directional
    position: 5,10,5
    intensity: 0.5
}

light ambient {
    type: ambient
    intensity: 0.1
}

camera main {
    position: 0,2,8
    lookAt: 0,0,0
    fov: 75
}

animate cube1 {
    at 0s -> rotation: 0,0,0
    at 4s -> rotation: 360,360,0
    easing: linear
}

animate cube2 {
    at 0s -> rotation: 0,0,0
    at 4s -> rotation: 0,360,360
    easing: linear
}

animate cube3 {
    at 0s -> rotation: 0,0,0
    at 4s -> rotation: 360,0,360
    easing: linear
}

animate cube1 {
    at 0s -> position: -2.5,0,0
    at 2s -> position: -2.5,1.5,0
    at 4s -> position: -2.5,0,0
    easing: easeInOut
}

animate cube3 {
    at 0s -> position: 2.5,0,0
    at 2s -> position: 2.5,-1.5,0
    at 4s -> position: 2.5,0,0
    easing: easeInOut
}`,

cinematic: `scene {
    duration: 8s
    loop: true
    background: #050510
    fog: on
    fogColor: #050510
    fogDensity: 0.015
    bloom: on
    bloomStrength: 1.0
}

object sphere {
    type: sphere
    position: 0,2,0
    scale: 2,2,2
    color: #ffffff
    emissive: #00ffaa
    intensity: 1.5
    metalness: 0.95
    roughness: 0.05
    segments: 64
}

object ring1 {
    type: torus
    position: 0,2,0
    scale: 3,3,0.1
    color: #00d9ff
    emissive: #00d9ff
    intensity: 2
}

object ring2 {
    type: torus
    position: 0,2,0
    scale: 4,4,0.1
    rotation: 60,0,0
    color: #ff0080
    emissive: #ff0080
    intensity: 2
}

object ground {
    type: plane
    position: 0,-0.5,0
    rotation: -90,0,0
    scale: 2.5,25,1
    color: #0a0a1a
    roughness: 0.95
}

light key {
    type: directional
    position: 8,12,5
    intensity: 2
    color: #ffffff
    shadow: true
}

light fill {
    type: point
    position: -5,3,2
    intensity: 1.5
    color: #ff6600
}

light ambient {
    type: ambient
    intensity: 0.15
}

camera main {
    position: 12,6,12
    lookAt: 0,2,0
    fov: 55
}

animate main {
    at 0s -> position: 12,6,12
    at 4s -> position: -12,6,12
    at 8s -> position: 12,6,12
    easing: easeInOut
}

animate sphere {
    at 0s -> rotation: 0,0,0
    at 8s -> rotation: 0,360,0
    easing: linear
}

animate ring1 {
    at 0s -> rotation: 0,0,0
    at 8s -> rotation: 360,0,0
    easing: linear
}

animate ring2 {
    at 0s -> rotation: 60,0,0
    at 8s -> rotation: 60,0,360
    easing: linear
}`,

car: `scene {
    duration: 6s
    loop: true
    background: #1a0a2e
    fog: on
    fogColor: #1a0a2e
    fogDensity: 0.012
    bloom: on
    bloomStrength: 0.8
}

object road {
    type: plane
    position: 0,-0.5,0
    rotation: -90,0,0
    scale: 1.5,30,1
    color: #1a1a1a
    roughness: 0.9
    receiveShadow: true
}

object carBody {
    type: cube
    position: 0,0.4,0
    scale: 1.6,0.7,3.0
    color: #cc0011
    emissive: #cc0011
    intensity: 0.2
    metalness: 0.95
    roughness: 0.1
}

object carRoof {
    type: cube
    position: 0,0.95,-0.2
    scale: 1.4,0.5,1.6
    color: #aa0011
    metalness: 0.9
    roughness: 0.15
}

object headlight_L {
    type: sphere
    position: -0.55,0.45,1.45
    scale: 0.18,0.12,0.1
    color: #ffffff
    emissive: #ffffff
    intensity: 5
}

object headlight_R {
    type: sphere
    position: 0.55,0.45,1.45
    scale: 0.18,0.12,0.1
    color: #ffffff
    emissive: #ffffff
    intensity: 5
}

object taillight_L {
    type: sphere
    position: -0.55,0.42,-1.45
    scale: 0.2,0.1,0.08
    color: #ff2200
    emissive: #ff2200
    intensity: 4
}

object taillight_R {
    type: sphere
    position: 0.55,0.42,-1.45
    scale: 0.2,0.1,0.08
    color: #ff2200
    emissive: #ff2200
    intensity: 4
}

object wheel_FL {
    type: torus
    position: -0.82,0.05,1.0
    rotation: 90,0,0
    scale: 0.45,0.45,0.22
    color: #111111
    roughness: 0.9
}

object wheel_FR {
    type: torus
    position: 0.82,0.05,1.0
    rotation: 90,0,0
    scale: 0.45,0.45,0.22
    color: #111111
    roughness: 0.9
}

object wheel_RL {
    type: torus
    position: -0.82,0.05,-1.0
    rotation: 90,0,0
    scale: 0.45,0.45,0.22
    color: #111111
    roughness: 0.9
}

object wheel_RR {
    type: torus
    position: 0.82,0.05,-1.0
    rotation: 90,0,0
    scale: 0.45,0.45,0.22
    color: #111111
    roughness: 0.9
}

light sun {
    type: directional
    position: 5,10,5
    intensity: 1.5
    color: #fff8dc
    shadow: true
}

light neon_L {
    type: point
    position: -3,1,0
    intensity: 2.0
    color: #ff0080
}

light neon_R {
    type: point
    position: 3,1,0
    intensity: 2.0
    color: #00d9ff
}

light ambient {
    type: ambient
    intensity: 0.2
    color: #2244ff
}

camera main {
    position: -3.5,3,8
    lookAt: 0,0.5,0
    fov: 60
}

animate wheel_FL {
    at 0s -> rotation: 90,0,0
    at 6s -> rotation: 90,0,2160
    easing: linear
}

animate wheel_FR {
    at 0s -> rotation: 90,0,0
    at 6s -> rotation: 90,0,2160
    easing: linear
}

animate wheel_RL {
    at 0s -> rotation: 90,0,0
    at 6s -> rotation: 90,0,2160
    easing: linear
}

animate wheel_RR {
    at 0s -> rotation: 90,0,0
    at 6s -> rotation: 90,0,2160
    easing: linear
}

animate main {
    at 0s -> position: -3.5,3,8
    at 3s -> position: -4.5,3.5,5
    at 6s -> position: -3.5,3,8
    easing: easeInOut
}`
};

// ── HELP CONTENT ──────────────────────────────────────────
const HELP_HTML = `
<h2>MotionScript DSL Reference</h2>
<p>A human-readable command language to create, animate and control 3D scenes using numbers and text.</p>

<h3>Format Rules</h3>
<table>
  <tr><th>Rule</th><th>Example</th><th>Note</th></tr>
  <tr><td>Block</td><td>object cube { }</td><td>keyword name { props }</td></tr>
  <tr><td>Property</td><td>color: #ff00ff</td><td>key: value</td></tr>
  <tr><td>Vector</td><td>position: 0,5,0</td><td>NO spaces between numbers</td></tr>
  <tr><td>Color</td><td>color: #ff00ff</td><td>Hex with # prefix</td></tr>
  <tr><td>Time</td><td>duration: 3s</td><td>Number + s suffix</td></tr>
  <tr><td>Boolean</td><td>loop: true</td><td>true or false (lowercase)</td></tr>
  <tr><td>Comment</td><td>// my note</td><td>Double slash</td></tr>
</table>

<h3>scene { }</h3>
<pre>scene {
    duration: 8s          // Animation length
    loop: true            // Loop infinitely
    background: #0a0e14   // Hex background color
    fog: on               // Enable fog
    fogColor: #1a1f3a     // Fog color
    fogDensity: 0.02      // Fog thickness (0-0.1)
    bloom: on             // Glow post-processing
    bloomStrength: 1.5    // Bloom power (0-3)
    ground: on            // Add ground plane
}</pre>

<h3>object name { }</h3>
<pre>object ball {
    type: sphere          // sphere|cube|cylinder|cone|plane|
                          // torus|torusKnot|dodecahedron|icosahedron|ring
    position: 0,5,0       // x,y,z world position
    rotation: 0,45,0      // x,y,z in degrees
    scale: 1,1,1          // x,y,z scale factors
    color: #ff00ff        // base color
    emissive: #ff00ff     // self-glow color
    intensity: 3          // emissive strength (0-10)
    metalness: 0.8        // 0=plastic 1=metal
    roughness: 0.2        // 0=mirror 1=matte
    opacity: 1.0          // transparency (0-1)
    wireframe: false      // wireframe mode
    shading: smooth       // smooth | flat
    segments: 32          // geometry resolution
    castShadow: true      // cast shadows
    receiveShadow: true   // receive shadows
    material: metal       // preset: metal|glass|plastic|neon|matte|mirror
}</pre>

<h3>light name { }</h3>
<pre>light sun {
    type: directional     // directional|point|spot|ambient|hemisphere
    position: 5,10,5      // x,y,z position
    color: #ffffff        // light color
    intensity: 2.0        // brightness (0-10)
    shadow: true          // cast shadows
    shadowResolution: 2048 // 512|1024|2048|4096
    distance: 100         // (point/spot) max range
    decay: 2              // (point/spot) falloff
    angle: 45             // (spot) cone angle degrees
}</pre>

<h3>camera name { }</h3>
<pre>camera main {
    position: 0,5,10      // x,y,z camera position
    lookAt: 0,0,0         // x,y,z look target
    fov: 75               // field of view (20-120)
    near: 0.1             // near clip plane
    far: 1000             // far clip plane
}</pre>

<h3>animate name { }</h3>
<pre>animate objectName {
    at 0s -> position: 0,0,0
    at 1.5s -> position: 0,5,0
    at 3s -> position: 0,0,0
    easing: easeInOut     // linear|easeIn|easeOut|easeInOut|
                          // easeInCubic|easeOutCubic|easeInOutCubic|
                          // easeInBack|easeOutBack|easeInOutBack|
                          // easeInBounce|easeOutBounce|easeInOutBounce|
                          // easeInElastic|easeOutElastic
    loop: true
    pingpong: false
    speed: 1.0            // playback speed multiplier
    delay: 0s             // start delay
}</pre>

<h3>Animatable Properties</h3>
<table>
  <tr><th>Property</th><th>Format</th><th>Example</th></tr>
  <tr><td>position</td><td>x,y,z</td><td>at 1s -> position: 0,5,0</td></tr>
  <tr><td>rotation</td><td>x,y,z (°)</td><td>at 1s -> rotation: 0,180,0</td></tr>
  <tr><td>scale</td><td>x,y,z</td><td>at 1s -> scale: 2,2,2</td></tr>
  <tr><td>intensity</td><td>number</td><td>at 1s -> intensity: 5</td></tr>
</table>

<h3>group name { }</h3>
<pre>group car {
    object body { type: cube, position: 0,0.5,0, color: #ff0000 }
    object wheel { type: torus, position: -1,0,1 }
}

animate car {
    at 0s -> position: 0,0,0
    at 3s -> position: 10,0,0
    easing: linear
}</pre>
`;

// ── MAIN APPLICATION ──────────────────────────────────────
class App {
  constructor() {
    this.orientMgr  = new OrientationManager();
    this.state      = new SceneState();
    this.parser     = new CommandParser();
    this.animEng    = new AnimationEngine();
    this.recorder   = new Recorder(document.getElementById('mainCanvas'));
    this.console    = new ConsoleUI(document.getElementById('conBody'), document.getElementById('consolePanel'));

    this.engine3d   = new Engine3D(document.getElementById('mainCanvas'));
    this.codeSync   = new CodeSync(document.getElementById('codeEditor'), this.state);
    this.selector   = new Selector(this.engine3d, this.state);
    this.timelineUI = new TimelineUI(document.getElementById('timelineCanvas'), document.getElementById('tlLabels'));

    this._raf = null;
    this._lastT = performance.now();
    this._fps = 60;
    this._frameCount = 0;
    this._fpsTimer = 0;

    this._initUI();
    this._startRenderLoop();
    this._loadExample('bouncing');
  }

  // ── RENDER LOOP ────────────────────────────────────────
  _startRenderLoop() {
    const loop = (now) => {
      this._raf = requestAnimationFrame(loop);
      const dt = Math.min((now - this._lastT) / 1000, .1);
      this._lastT = now;

      // FPS counter
      this._frameCount++;
      this._fpsTimer += dt;
      if (this._fpsTimer >= .5) {
        this._fps = Math.round(this._frameCount / this._fpsTimer);
        this._frameCount = 0; this._fpsTimer = 0;
        document.getElementById('fpsVal').textContent  = this._fps;
        document.getElementById('vpFps').textContent   = this._fps + ' FPS';
      }

      this.animEng.update(dt);
      this.engine3d.render();

      this._updatePlayhead();
      this._syncCameraState();
    };
    this._raf = requestAnimationFrame(loop);
  }

  _updatePlayhead() {
    const t = this.animEng.time, d = this.animEng.duration || 1;
    const pct = Math.min(100, (t/d)*100);
    document.getElementById('pbProgress').style.width = pct + '%';
    document.getElementById('pbSeek').value = pct * 10;
    document.getElementById('pbTime').textContent = `${t.toFixed(2)}s / ${d.toFixed(1)}s`;
    document.getElementById('tlTime').textContent  = t.toFixed(2) + 's';
    this.timelineUI.draw(this.state.animations, t, d);
  }

  _syncCameraState() {
    const c = this.engine3d.camera;
    this.state.camState.position = { x:+c.position.x.toFixed(2), y:+c.position.y.toFixed(2), z:+c.position.z.toFixed(2) };
  }

  // ── UI INITIALIZATION ──────────────────────────────────
  _initUI() {
    this._bindToolbar();
    this._bindCodeEditor();
    this._bindPlayback();
    this._bindPanelTabs();
    this._bindSceneProps();
    this._bindCameraProps();
    this._bindObjectProps();
    this._bindLightsPanel();
    this._bindViewportTools();
    this._bindModals();
    this._bindGizmos();
    this._bindCanvas();
    this._bindKeyboard();
    this._populateHelp();
  }

  // ── TOOLBAR ────────────────────────────────────────────
  _bindToolbar() {
    this.$('btnNew').onclick    = () => this._newScene();
    this.$('btnSave').onclick   = () => this._saveProject();
    this.$('btnLoad').onclick   = () => this.$('fileInput').click();
    this.$('fileInput').onchange= e  => this._loadProject(e);
    this.$('btnExportPNG').onclick = () => this.recorder.exportPNG(this.engine3d.canvas);
    this.$('btnExportVid').onclick = () => this._toggleRecord();
    this.$('btnHelp').onclick   = () => this._openModal('modalHelp');
    this.$('btnGrid').onclick   = () => this._toggleToolBtn('btnGrid', on => this.engine3d.toggleGrid(on));
    this.$('btnAxis').onclick   = () => this._toggleToolBtn('btnAxis', on => this.engine3d.toggleAxes(on));
    this.$('btnShadow').onclick = () => this._toggleToolBtn('btnShadow', on => this.engine3d.toggleShadows(on));

    // Mode switch
    document.querySelectorAll('.mode-btn').forEach(btn => {
      btn.onclick = () => {
        document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      };
    });
  }

  _toggleToolBtn(id, cb) {
    const btn = this.$(id);
    const on = btn.dataset.active !== 'true';
    btn.dataset.active = on;
    cb(on);
  }

  // ── CODE EDITOR ────────────────────────────────────────
  _bindCodeEditor() {
    const ed = this.$('codeEditor');
    ed.addEventListener('input', () => this.updateLineNumbers());
    ed.addEventListener('keydown', e => {
      if (e.key === 'Tab') { e.preventDefault(); const s=ed.selectionStart, end=ed.selectionEnd; ed.value=ed.value.substring(0,s)+'    '+ed.value.substring(end); ed.selectionStart=ed.selectionEnd=s+4; }
    });
    ed.addEventListener('scroll', () => { this.$('lineNums').scrollTop = ed.scrollTop; });

    this.$('btnRun').onclick    = () => this._run();
    this.$('btnClear').onclick  = () => { ed.value=''; this.updateLineNumbers(); };
    this.$('btnFormat').onclick = () => this._formatCode();

    document.querySelectorAll('.ex-btn').forEach(btn => {
      btn.onclick = () => this._loadExample(btn.dataset.ex);
    });

    // Panel tab switching
    document.querySelectorAll('[data-ptab]').forEach(btn => {
      if (btn.closest('.panel-left')) {
        btn.onclick = () => {
          const tabs = btn.closest('.panel-left').querySelectorAll('.ptab');
          const contents = btn.closest('.panel-left').querySelectorAll('.ptab-content');
          tabs.forEach(t => t.classList.remove('active'));
          contents.forEach(c => c.classList.remove('active'));
          btn.classList.add('active');
          this.$(`ptab${btn.dataset.ptab.charAt(0).toUpperCase()+btn.dataset.ptab.slice(1)}`).classList.add('active');
        };
      }
    });

    // Outliner buttons
    this.$('btnAddObj').onclick   = () => this._openModal('modalAddObj');
    this.$('btnAddLight').onclick = () => this._openModal('modalAddLight');
  }

  updateLineNumbers() {
    const ed = this.$('codeEditor');
    const lines = ed.value.split('\n').length;
    this.$('lineNums').textContent = Array.from({length:lines},(_,i)=>i+1).join('\n');
  }

  _formatCode() {
    const code = this.$('codeEditor').value;
    // Basic formatting: ensure consistent spacing
    const formatted = code
      .replace(/\{([^\n])/g, '{\n    $1')
      .replace(/\}\s*\n/g, '}\n\n')
      .replace(/\n{3,}/g, '\n\n');
    this.$('codeEditor').value = formatted;
    this.updateLineNumbers();
  }

  // ── PLAYBACK ───────────────────────────────────────────
  _bindPlayback() {
    this.$('pbPlay').onclick   = () => { this.animEng.play(); this.$('pbPlay').style.color='var(--green)'; this.$('pbPause').style.color=''; };
    this.$('pbPause').onclick  = () => { this.animEng.pause(); this.$('pbPause').style.color='var(--yellow)'; this.$('pbPlay').style.color=''; };
    this.$('pbReset').onclick  = () => { this.animEng.reset(); this.$('pbPlay').style.color=''; this.$('pbPause').style.color=''; };
    this.$('pbRecord').onclick = () => this._toggleRecord();

    this.$('pbSeek').addEventListener('input', e => {
      const t = (parseFloat(e.target.value)/1000) * this.animEng.duration;
      this.animEng.seek(t);
    });
  }

  _toggleRecord() {
    const btn = this.$('pbRecord');
    const ind = this.$('recIndicator');
    const expBtn = this.$('btnExportVid');
    if (!this.recorder.active) {
      this.recorder.start(30);
      btn.classList.add('recording');
      ind.style.display = 'inline';
      expBtn.textContent = '⏹ Stop';
      this.animEng.reset(); this.animEng.play();
      this.console.info('Recording started...');
      setTimeout(() => { if(this.recorder.active) this._stopRecord(); }, (this.animEng.duration+.5)*1000);
    } else {
      this._stopRecord();
    }
  }

  _stopRecord() {
    this.recorder.stop();
    this.$('pbRecord').classList.remove('recording');
    this.$('recIndicator').style.display = 'none';
    this.$('btnExportVid').textContent = '🎬 Video';
    this.console.success('Video saved!');
  }

  // ── PANEL TABS (Right) ────────────────────────────────
  _bindPanelTabs() {
    document.querySelectorAll('[data-ptab]').forEach(btn => {
      if (!btn.closest('.panel-right')) return;
      btn.onclick = () => {
        const panel = btn.closest('.panel-right');
        panel.querySelectorAll('.ptab').forEach(t => t.classList.remove('active'));
        panel.querySelectorAll('.ptab-content').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        const tabMap = { scene:'ptabScene', object:'ptabObject', material:'ptabMaterial', lights:'ptabLights', camera:'ptabCamera' };
        const target = tabMap[btn.dataset.ptab];
        if (target) this.$(target).classList.add('active');
      };
    });
  }

  // ── SCENE PROPERTIES ──────────────────────────────────
  _bindSceneProps() {
    const sync = (id, key, transform=v=>v) => {
      this.$(id).addEventListener('input', e => {
        this.state.settings[key] = transform(e.target.type==='checkbox' ? e.target.checked : e.target.value);
        this._applySceneSettings();
        this.codeSync.update();
      });
    };

    sync('sceneDuration', 'duration', parseFloat);
    sync('sceneLoop', 'loop');
    sync('sceneBg', 'background');
    sync('scFogOn', 'fog');
    sync('scFogColor', 'fogColor');
    sync('scGround', 'ground');
    sync('scBloom', 'bloom');

    this.$('scFogDensity').addEventListener('input', e => {
      this.state.settings.fogDensity = parseFloat(e.target.value);
      this.$('scFogDensityVal').textContent = parseFloat(e.target.value).toFixed(3);
      this._applySceneSettings();
    });
    this.$('scBloomStr').addEventListener('input', e => {
      this.state.settings.bloomStrength = parseFloat(e.target.value);
      this.$('scBloomStrVal').textContent = parseFloat(e.target.value).toFixed(1);
    });

    // Sliders with value display
    [['scContrast','scContrastVal'], ['scSaturation','scSaturationVal']].forEach(([sid,vid]) => {
      this.$(sid).addEventListener('input', e => {
        this.$(vid).textContent = parseFloat(e.target.value).toFixed(1);
      });
    });
  }

  _applySceneSettings() {
    const s = this.state.settings;
    this.engine3d.setBackground(s.background);
    this.engine3d.setFog(s.fog, s.fogColor, s.fogDensity);
    if (s.ground) this.engine3d.addGround(); else this.engine3d.removeGround();
    this.animEng.duration = s.duration || 8;
    this.animEng.loop = s.loop;
    document.getElementById('vpOverlay').classList.add('hidden');
  }

  // ── VIEWPORT TOOLS ─────────────────────────────────────
  _bindViewportTools() {
    this.$('vpGrid').addEventListener('click', () => {
      const on = this.$('vpGrid').dataset.on !== 'true';
      this.$('vpGrid').dataset.on = on;
      this.engine3d.toggleGrid(on);
    });
    this.$('vpAxis').addEventListener('click', () => {
      const on = this.$('vpAxis').dataset.on !== 'true';
      this.$('vpAxis').dataset.on = on;
      this.engine3d.toggleAxes(on);
    });
    this.$('vpWire').addEventListener('click', () => {
      const on = this.$('vpWire').dataset.on !== 'true';
      this.$('vpWire').dataset.on = on;
      this.state.objects.forEach(obj => { if(obj.mesh.material) obj.mesh.material.wireframe = on; });
    });
    this.$('vpShadow').addEventListener('click', () => {
      const on = this.$('vpShadow').dataset.on !== 'true';
      this.$('vpShadow').dataset.on = on;
      this.engine3d.toggleShadows(on);
    });
  }

  // ── OBJECT PROPERTIES ──────────────────────────────────
  _bindObjectProps() {
    const liveUpdate = (ids, fn) => {
      ids.forEach(id => {
        this.$(id)?.addEventListener('input', () => {
          if (this.selector.selected) fn(this.selector.selected);
        });
      });
    };

    // Transform
    liveUpdate(['objPx','objPy','objPz'], id => {
      const o = this.state.objects.get(id); if(!o) return;
      o.mesh.position.set(+this.$('objPx').value||0, +this.$('objPy').value||0, +this.$('objPz').value||0);
      this.codeSync.update();
    });
    liveUpdate(['objRx','objRy','objRz'], id => {
      const o = this.state.objects.get(id); if(!o) return;
      o.mesh.rotation.set((+this.$('objRx').value||0)*Math.PI/180, (+this.$('objRy').value||0)*Math.PI/180, (+this.$('objRz').value||0)*Math.PI/180);
      this.codeSync.update();
    });
    liveUpdate(['objSx','objSy','objSz'], id => {
      const o = this.state.objects.get(id); if(!o) return;
      const v = v => Math.max(0.001, +v||1);
      o.mesh.scale.set(v(this.$('objSx').value), v(this.$('objSy').value), v(this.$('objSz').value));
      this.codeSync.update();
    });

    // Geometry flags
    this.$('objWireframe').addEventListener('change', e => {
      const o = this.state.objects.get(this.selector.selected); if(!o) return;
      o.mesh.material.wireframe = e.target.checked;
      this.codeSync.update();
    });
    this.$('objVisible').addEventListener('change', e => {
      const o = this.state.objects.get(this.selector.selected); if(!o) return;
      o.mesh.visible = e.target.checked;
      this.codeSync.update();
    });
    this.$('objShading').addEventListener('change', e => {
      const o = this.state.objects.get(this.selector.selected); if(!o) return;
      o.mesh.material.flatShading = e.target.value === 'flat';
      o.mesh.material.needsUpdate = true;
    });
    this.$('objName').addEventListener('change', e => {
      const old = this.selector.selected; if(!old) return;
      const obj = this.state.objects.get(old); if(!obj) return;
      const newId = e.target.value.trim().replace(/\s+/g,'_') || old;
      if (newId !== old) {
        this.state.objects.set(newId, obj);
        this.state.objects.delete(old);
        obj.mesh.name = newId;
        obj.def._id = newId;
        this.selector.selected = newId;
        this.codeSync.update();
        this._updateOutliner();
      }
    });

    // Actions
    this.$('btnDeleteObj').onclick = () => {
      if (this.selector.selected) this._deleteObject(this.selector.selected);
    };
    this.$('btnDuplicate').onclick = () => {
      if (this.selector.selected) this._duplicateObject(this.selector.selected);
    };
  }

  // ── MATERIAL PANEL ─────────────────────────────────────
  _bindMaterialProps() {
    const liveMatUpdate = (ids, fn) => {
      ids.forEach(id => {
        this.$(id)?.addEventListener('input', () => {
          const o = this.state.objects.get(this.selector.selected); if(!o) return;
          fn(o.mesh.material, this.$(id));
          this.codeSync.update();
        });
      });
    };

    this.$('matPreset').addEventListener('change', e => {
      const o = this.state.objects.get(this.selector.selected); if(!o) return;
      const preset = ObjectFactory.MATERIAL_PRESETS[e.target.value];
      if (preset) {
        if (preset.color) { o.mesh.material.color.set(preset.color); this.$('matColor').value = preset.color; }
        if (preset.metalness !== undefined) { o.mesh.material.metalness = preset.metalness; this.$('matMetalness').value = preset.metalness; this.$('matMetalnessVal').textContent = preset.metalness.toFixed(2); }
        if (preset.roughness !== undefined) { o.mesh.material.roughness = preset.roughness; this.$('matRoughness').value = preset.roughness; this.$('matRoughnessVal').textContent = preset.roughness.toFixed(2); }
        if (preset.opacity !== undefined) { o.mesh.material.opacity = preset.opacity; o.mesh.material.transparent = true; this.$('matOpacity').value = preset.opacity; this.$('matOpacityVal').textContent = preset.opacity.toFixed(2); }
        this.codeSync.update();
      }
    });

    liveMatUpdate(['matColor'], (mat,el) => mat.color.set(el.value));
    liveMatUpdate(['matEmissive'], (mat,el) => mat.emissive.set(el.value));
    liveMatUpdate(['matMetalness'], (mat,el) => { mat.metalness = +el.value; this.$('matMetalnessVal').textContent=(+el.value).toFixed(2); });
    liveMatUpdate(['matRoughness'], (mat,el) => { mat.roughness = +el.value; this.$('matRoughnessVal').textContent=(+el.value).toFixed(2); });
    liveMatUpdate(['matOpacity'], (mat,el) => { mat.opacity = +el.value; mat.transparent = +el.value<1; this.$('matOpacityVal').textContent=(+el.value).toFixed(2); });
    liveMatUpdate(['matEmissiveInt'], (mat,el) => { mat.emissiveIntensity = +el.value; this.$('matEmissiveIntVal').textContent=(+el.value).toFixed(1); });

    // Texture loading
    this.$('matTexFile').addEventListener('change', e => {
      const file = e.target.files[0]; if(!file) return;
      const url = URL.createObjectURL(file);
      const o = this.state.objects.get(this.selector.selected); if(!o) return;
      new THREE.TextureLoader().load(url, tex => {
        o.mesh.material.map = tex; o.mesh.material.needsUpdate = true;
      });
    });
    this.$('matNormFile').addEventListener('change', e => {
      const file = e.target.files[0]; if(!file) return;
      const url = URL.createObjectURL(file);
      const o = this.state.objects.get(this.selector.selected); if(!o) return;
      new THREE.TextureLoader().load(url, tex => {
        o.mesh.material.normalMap = tex; o.mesh.material.needsUpdate = true;
      });
    });
  }

  // ── LIGHTS PANEL ───────────────────────────────────────
  _bindLightsPanel() {
    this.$('btnAddLight2').onclick = () => this._openModal('modalAddLight');
    this._bindMaterialProps();
  }

  _rebuildLightsList() {
    const list = this.$('lightsList');
    list.innerHTML = '';
    if (!this.state.lights.size) { list.innerHTML = '<div class="no-lights">No lights. Add one above.</div>'; return; }
    this.state.lights.forEach((lg, id) => {
      const l = lg.light;
      const div = document.createElement('div');
      div.className = 'light-item';
      const colorHex = '#' + l.color.getHexString();
      div.innerHTML = `
        <div class="light-row1">
          <div class="light-dot" style="background:${colorHex};box-shadow:0 0 6px ${colorHex}"></div>
          <span class="light-name">${id}</span>
          <span class="light-type">${lg.def.type}</span>
          <button class="light-del" data-id="${id}" title="Delete">✕</button>
        </div>
        <div class="light-controls">
          <div class="light-ctrl"><label>Intensity</label><input type="range" min="0" max="10" step=".1" value="${l.intensity}" data-id="${id}" data-prop="intensity"><span>${l.intensity.toFixed(1)}</span></div>
          <div class="light-ctrl"><label>Color</label><input type="color" value="${colorHex}" data-id="${id}" data-prop="color"></div>
        </div>`;
      div.querySelector('.light-del').onclick = () => { this._deleteLight(id); };
      div.querySelector('[data-prop="intensity"]').addEventListener('input', e => {
        l.intensity = parseFloat(e.target.value);
        e.target.nextElementSibling.textContent = l.intensity.toFixed(1);
        this.codeSync.update();
      });
      div.querySelector('[data-prop="color"]').addEventListener('input', e => {
        l.color.set(e.target.value);
        div.querySelector('.light-dot').style.background = e.target.value;
        this.codeSync.update();
      });
      list.appendChild(div);
    });
  }

  // ── CAMERA PROPERTIES ──────────────────────────────────
  _bindCameraProps() {
    this.$('camFov').addEventListener('input', e => {
      const fov = parseInt(e.target.value);
      this.$('camFovVal').textContent = fov + '°';
      this.engine3d.camera.fov = fov;
      this.engine3d.camera.updateProjectionMatrix();
      this.state.camState.fov = fov;
    });
    this.$('btnCamReset').onclick = () => {
      this.engine3d.camera.position.set(0,5,10);
      this.engine3d.camera.lookAt(0,0,0);
      if(this.engine3d.controls) this.engine3d.controls.reset();
      this._syncCameraToInputs();
    };
    this.$('btnCamApply').onclick = () => {
      const p = { x:+this.$('camPx').value, y:+this.$('camPy').value, z:+this.$('camPz').value };
      const l = { x:+this.$('camLx').value, y:+this.$('camLy').value, z:+this.$('camLz').value };
      this.engine3d.camera.position.set(p.x, p.y, p.z);
      this.engine3d.camera.lookAt(l.x, l.y, l.z);
      this.state.camState.position = p; this.state.camState.lookAt = l;
      if(this.engine3d.controls) { this.engine3d.controls.target.set(l.x,l.y,l.z); this.engine3d.controls.update(); }
      this.codeSync.update();
    };
  }

  _syncCameraToInputs() {
    const c = this.engine3d.camera;
    this.$('camPx').value = c.position.x.toFixed(1);
    this.$('camPy').value = c.position.y.toFixed(1);
    this.$('camPz').value = c.position.z.toFixed(1);
  }

  // ── MODALS ─────────────────────────────────────────────
  _bindModals() {
    document.querySelectorAll('.modal-close, .modal-overlay').forEach(el => {
      el.onclick = (e) => {
        if (e.target === el) { const id = el.dataset?.modal || el.id; if(id) this.$(id).style.display='none'; }
      };
    });
    document.querySelectorAll('[data-modal]').forEach(btn => {
      if (btn.classList.contains('modal-close')) btn.onclick = () => this.$(btn.dataset.modal).style.display = 'none';
    });

    // Add Object
    document.querySelectorAll('.obj-card').forEach(card => {
      card.onclick = () => {
        this._addObjectToScene(card.dataset.type);
        this.$('modalAddObj').style.display = 'none';
      };
    });

    // Add Light
    document.querySelectorAll('.light-card').forEach(card => {
      card.onclick = () => {
        this._addLightToScene(card.dataset.type);
        this.$('modalAddLight').style.display = 'none';
      };
    });

    // Console
    this.$('conClear').onclick = () => this.console.clear();
    this.$('conClose').onclick = () => { this.$('consolePanel').style.display='none'; };
  }

  _openModal(id) { this.$(id).style.display = 'flex'; }

  // ── GIZMOS ─────────────────────────────────────────────
  _bindGizmos() {
    document.querySelectorAll('.gizmo-btn').forEach(btn => {
      btn.onclick = () => {
        document.querySelectorAll('.gizmo-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      };
    });
  }

  // ── CANVAS CLICK (Selection) ───────────────────────────
  _bindCanvas() {
    const canvas = document.getElementById('mainCanvas');
    let mouseDownPos = {x:0,y:0};

    canvas.addEventListener('mousedown', e => { mouseDownPos = {x:e.clientX,y:e.clientY}; });
    canvas.addEventListener('mouseup', e => {
      const dx = Math.abs(e.clientX-mouseDownPos.x), dy = Math.abs(e.clientY-mouseDownPos.y);
      if (dx < 5 && dy < 5) {  // Click not drag
        const id = this.selector.pick(e);
        if (id) this._selectObject(id);
        else this._deselect();
      }
    });
  }

  // ── KEYBOARD SHORTCUTS ────────────────────────────────
  _bindKeyboard() {
    window.addEventListener('keydown', e => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.code === 'Space') { e.preventDefault(); this.animEng.playing ? this.animEng.pause() : this.animEng.play(); }
      if (e.code === 'KeyR' && e.ctrlKey) { e.preventDefault(); this._run(); }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (this.selector.selected) this._deleteObject(this.selector.selected);
      }
    });
  }

  // ── CORE: RUN CODE ────────────────────────────────────
  _run() {
    const code = this.$('codeEditor').value.trim();
    if (!code) { this.console.warn('No code to run.'); return; }
    try {
      const cmd = this.parser.parse(code);
      this.engine3d.clearObjects();
      this.state.reset();
      this.selector.clearOutline();

      // Scene settings
      const sc = cmd.scene;
      this.state.settings = {
        duration:      sc.duration || 8,
        loop:          sc.loop !== false,
        background:    sc.background || '#0a0e14',
        fog:           !!sc.fog,
        fogColor:      sc.fogColor || '#1a1f3a',
        fogDensity:    sc.fogDensity || .02,
        bloom:         !!sc.bloom,
        bloomStrength: sc.bloomStrength || .7,
        ground:        !!sc.ground,
      };
      this._applySceneSettings();
      this._syncSettingsToUI();

      // Objects
      Object.entries(cmd.objects).forEach(([id, def]) => {
        def._id = id;
        const mesh = ObjectFactory.create(def.type||'sphere', def);
        this.engine3d.scene.add(mesh);
        this.state.addObject(id, mesh, def);
      });

      // Groups
      Object.entries(cmd.groups).forEach(([gid, gdef]) => {
        const grp = new THREE.Group(); grp.name = gid;
        Object.entries(gdef.objects || {}).forEach(([oid, odef]) => {
          odef._id = oid;
          const m = ObjectFactory.create(odef.type||'sphere', odef);
          grp.add(m);
          this.state.addObject(oid, m, odef);
        });
        this.engine3d.scene.add(grp);
      });

      // Lights
      Object.entries(cmd.lights).forEach(([id, def]) => {
        def._id = id;
        const light = ObjectFactory.createLight(def.type||'directional', def);
        this.engine3d.scene.add(light);
        this.state.addLight(id, light, def);
      });

      // Camera
      if (cmd.camera.position) {
        const p = cmd.camera.position;
        this.engine3d.camera.position.set(p.x, p.y, p.z);
        this.state.camState.position = p;
      }
      if (cmd.camera.lookAt) {
        const l = cmd.camera.lookAt;
        this.engine3d.camera.lookAt(l.x, l.y, l.z);
        if (this.engine3d.controls) this.engine3d.controls.target.set(l.x, l.y, l.z);
        this.state.camState.lookAt = l;
      }
      if (cmd.camera.fov) {
        this.engine3d.camera.fov = cmd.camera.fov;
        this.engine3d.camera.updateProjectionMatrix();
        this.state.camState.fov = cmd.camera.fov;
        this.$('camFov').value = cmd.camera.fov;
        this.$('camFovVal').textContent = cmd.camera.fov + '°';
      }

      // Animations
      this.state.animations = cmd.animations;
      this.animEng.load(cmd.animations, this.state.objects, this.engine3d.camera);
      this.animEng.duration = this.state.settings.duration;
      this.animEng.loop = this.state.settings.loop;

      // Update UI
      this._updateOutliner();
      this._rebuildLightsList();
      this.timelineUI.updateLabels(cmd.animations);
      this._updateStats();

      this.animEng.reset(); this.animEng.play();
      this.$('vpOverlay').classList.add('hidden');
      this.console.success(`Scene built: ${this.state.objects.size} objects, ${this.state.lights.size} lights, ${cmd.animations.length} animations.`);

    } catch(err) {
      this.console.error('Parse error: ' + err.message);
    }
  }

  _syncSettingsToUI() {
    const s = this.state.settings;
    this.$('sceneDuration').value = s.duration;
    this.$('sceneLoop').checked = s.loop;
    this.$('sceneBg').value = s.background;
    this.$('scFogOn').checked = s.fog;
    this.$('scFogColor').value = s.fogColor;
    this.$('scFogDensity').value = s.fogDensity;
    this.$('scFogDensityVal').textContent = s.fogDensity.toFixed(3);
    this.$('scBloom').checked = s.bloom;
    this.$('scBloomStr').value = s.bloomStrength;
    this.$('scBloomStrVal').textContent = s.bloomStrength.toFixed(1);
    this.$('scGround').checked = s.ground;
    this.animEng.duration = s.duration;
    this.animEng.loop = s.loop;
  }

  // ── ADD OBJECT (Manual Mode) ───────────────────────────
  _addObjectToScene(type) {
    const id = this.state.nextId(type);
    const def = { type, position:{x:0,y:1,z:0}, scale:{x:1,y:1,z:1}, rotation:{x:0,y:0,z:0}, color:'#00d9ff', metalness:.5, roughness:.5, _id:id };
    const mesh = ObjectFactory.create(type, def);
    this.engine3d.scene.add(mesh);
    this.state.addObject(id, mesh, def);
    this._updateOutliner();
    this._updateStats();
    this.codeSync.update();
    this._selectObject(id);
    this.console.info(`Added ${type} "${id}"`);
    this.$('vpOverlay').classList.add('hidden');
  }

  // ── ADD LIGHT (Manual Mode) ────────────────────────────
  _addLightToScene(type) {
    const id = this.state.nextId(type + 'Light');
    const defaults = { directional:{position:{x:5,y:10,z:5}}, point:{position:{x:0,y:5,z:0}}, spot:{position:{x:0,y:10,z:0}}, ambient:{}, hemisphere:{} };
    const def = { type, color:'#ffffff', intensity:1, ...defaults[type]||{}, _id:id };
    const light = ObjectFactory.createLight(type, def);
    this.engine3d.scene.add(light);
    this.state.addLight(id, light, def);
    this._rebuildLightsList();
    this._updateStats();
    this.codeSync.update();
    this.console.info(`Added ${type} light "${id}"`);
  }

  // ── DELETE OBJECT ──────────────────────────────────────
  _deleteObject(id) {
    const obj = this.state.objects.get(id); if(!obj) return;
    this.engine3d.scene.remove(obj.mesh);
    obj.mesh.geometry?.dispose();
    if(obj.mesh.material) {
      const mats = Array.isArray(obj.mesh.material)?obj.mesh.material:[obj.mesh.material];
      mats.forEach(m=>m.dispose());
    }
    this.state.removeObject(id);
    if (this.selector.selected === id) { this.selector.clearOutline(); this._deselect(); }
    this._updateOutliner();
    this._updateStats();
    this.codeSync.update();
    this.console.info(`Deleted "${id}"`);
  }

  // ── DELETE LIGHT ───────────────────────────────────────
  _deleteLight(id) {
    const lg = this.state.lights.get(id); if(!lg) return;
    this.engine3d.scene.remove(lg.light);
    this.state.removeLight(id);
    this._rebuildLightsList();
    this._updateStats();
    this.codeSync.update();
    this.console.info(`Deleted light "${id}"`);
  }

  // ── DUPLICATE OBJECT ───────────────────────────────────
  _duplicateObject(id) {
    const obj = this.state.objects.get(id); if(!obj) return;
    const newId = this.state.nextId(obj.def.type||'obj');
    const def = {...obj.def, _id:newId, position:{...obj.def.position, x:(obj.def.position?.x||0)+1.5}};
    const mesh = ObjectFactory.create(def.type||'sphere', def);
    this.engine3d.scene.add(mesh);
    this.state.addObject(newId, mesh, def);
    this._updateOutliner();
    this._updateStats();
    this.codeSync.update();
    this._selectObject(newId);
    this.console.info(`Duplicated "${id}" → "${newId}"`);
  }

  // ── SELECT OBJECT ──────────────────────────────────────
  _selectObject(id) {
    this.selector.select(id);
    const obj = this.state.objects.get(id); if(!obj) return;
    const m = obj.mesh;

    // Show badge
    const badge = this.$('selBadge');
    badge.style.display = 'block';
    badge.textContent = `${id} (${obj.def.type||'object'})`;

    // Update status bar
    this.$('vpSelected').textContent = `Selected: ${id}`;

    // Fill object props
    this.$('objName').value = id;
    this.$('objPx').value = m.position.x.toFixed(2);
    this.$('objPy').value = m.position.y.toFixed(2);
    this.$('objPz').value = m.position.z.toFixed(2);
    this.$('objRx').value = (m.rotation.x*180/Math.PI).toFixed(1);
    this.$('objRy').value = (m.rotation.y*180/Math.PI).toFixed(1);
    this.$('objRz').value = (m.rotation.z*180/Math.PI).toFixed(1);
    this.$('objSx').value = m.scale.x.toFixed(2);
    this.$('objSy').value = m.scale.y.toFixed(2);
    this.$('objSz').value = m.scale.z.toFixed(2);
    this.$('objType').value = obj.def.type || 'sphere';
    this.$('objShading').value = m.material.flatShading ? 'flat' : 'smooth';
    this.$('objWireframe').checked = m.material.wireframe;
    this.$('objVisible').checked = m.visible;

    // Fill material props
    this.$('matColor').value = '#' + m.material.color.getHexString();
    this.$('matEmissive').value = '#' + m.material.emissive.getHexString();
    this.$('matMetalness').value = m.material.metalness;
    this.$('matRoughness').value = m.material.roughness;
    this.$('matOpacity').value = m.material.opacity;
    this.$('matEmissiveInt').value = m.material.emissiveIntensity;
    this.$('matMetalnessVal').textContent = m.material.metalness.toFixed(2);
    this.$('matRoughnessVal').textContent = m.material.roughness.toFixed(2);
    this.$('matOpacityVal').textContent = m.material.opacity.toFixed(2);
    this.$('matEmissiveIntVal').textContent = m.material.emissiveIntensity.toFixed(1);

    // Show properties panel
    this.$('objPropsEmpty').style.display = 'none';
    this.$('objProps').style.display = 'block';
    this.$('matPropsEmpty').style.display = 'none';
    this.$('matProps').style.display = 'block';

    // Highlight in outliner
    document.querySelectorAll('.tree-item').forEach(el => {
      el.classList.toggle('selected', el.dataset.id === id);
    });
  }

  _deselect() {
    this.$('selBadge').style.display = 'none';
    this.$('vpSelected').textContent = 'Nothing selected';
    this.$('objPropsEmpty').style.display = 'flex';
    this.$('objProps').style.display = 'none';
    this.$('matPropsEmpty').style.display = 'flex';
    this.$('matProps').style.display = 'none';
    document.querySelectorAll('.tree-item').forEach(el => el.classList.remove('selected'));
  }

  // ── OUTLINER ───────────────────────────────────────────
  _updateOutliner() {
    const tree = this.$('outlinerTree');
    tree.innerHTML = '';
    if (!this.state.objects.size && !this.state.lights.size) {
      tree.innerHTML = '<div class="outliner-empty">No objects yet</div>';
      return;
    }
    // Camera
    const camDiv = document.createElement('div');
    camDiv.className = 'tree-item'; camDiv.dataset.id = '__camera';
    camDiv.innerHTML = `<span class="tree-icon">🎥</span><span class="tree-name">Camera</span><span class="tree-type">camera</span>`;
    tree.appendChild(camDiv);

    // Objects
    this.state.objects.forEach((obj, id) => {
      const div = document.createElement('div');
      div.className = 'tree-item'; div.dataset.id = id;
      const icons = { sphere:'●', cube:'■', cylinder:'⬛', cone:'▲', torus:'◯', plane:'▬', torusKnot:'∞', dodecahedron:'⬡', icosahedron:'◆' };
      const icon = icons[obj.def.type] || '◈';
      div.innerHTML = `
        <span class="tree-icon">${icon}</span>
        <span class="tree-name">${id}</span>
        <span class="tree-type">${obj.def.type||'obj'}</span>
        <button class="tree-vis" title="Toggle visibility" data-id="${id}">👁</button>
        <button class="tree-del" title="Delete" data-id="${id}">✕</button>`;
      div.onclick = (e) => {
        if (e.target.classList.contains('tree-vis') || e.target.classList.contains('tree-del')) return;
        this._selectObject(id);
      };
      div.querySelector('.tree-vis').onclick = () => {
        const o = this.state.objects.get(id); if(o) { o.mesh.visible = !o.mesh.visible; this.codeSync.update(); }
      };
      div.querySelector('.tree-del').onclick = () => this._deleteObject(id);
      tree.appendChild(div);
    });

    // Lights
    this.state.lights.forEach((lg, id) => {
      const div = document.createElement('div');
      div.className = 'tree-item'; div.dataset.id = id;
      const icons = { directional:'☀', point:'💡', spot:'🔦', ambient:'◌', hemisphere:'◑' };
      div.innerHTML = `
        <span class="tree-icon">${icons[lg.def.type]||'☀'}</span>
        <span class="tree-name">${id}</span>
        <span class="tree-type">${lg.def.type}</span>
        <button class="tree-del" title="Delete" data-id="${id}">✕</button>`;
      div.querySelector('.tree-del').onclick = () => this._deleteLight(id);
      tree.appendChild(div);
    });
  }

  // ── STATS ─────────────────────────────────────────────
  _updateStats() {
    const oc = this.state.objects.size, lc = this.state.lights.size;
    this.$('statObjects').textContent = oc;
    this.$('statLights').textContent  = lc;
    this.$('vpObjects').textContent   = oc + ' Objects';
    this.$('vpLights').textContent    = lc + ' Lights';
  }

  // ── SAVE / LOAD ────────────────────────────────────────
  _saveProject() {
    const data = {
      version: '1.0',
      code: this.$('codeEditor').value,
      settings: this.state.settings,
      camera: this.state.camState,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
    const a = Object.assign(document.createElement('a'), { href:URL.createObjectURL(blob), download:`scene_${Date.now()}.motion` });
    a.click(); URL.revokeObjectURL(a.href);
    this.console.success('Project saved!');
  }

  _loadProject(e) {
    const file = e.target.files[0]; if(!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const data = JSON.parse(ev.target.result);
        if (data.code) { this.$('codeEditor').value = data.code; this.updateLineNumbers(); this._run(); }
        this.console.success('Project loaded: ' + file.name);
      } catch(err) { this.console.error('Failed to load project: ' + err.message); }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  _newScene() {
    if (!confirm('Start a new scene? Current scene will be cleared.')) return;
    this.engine3d.clearObjects();
    this.state.reset();
    this.selector.clearOutline();
    this.$('codeEditor').value = '';
    this.updateLineNumbers();
    this._updateOutliner();
    this._rebuildLightsList();
    this._updateStats();
    this._deselect();
    this.animEng.reset();
    this.$('vpOverlay').classList.remove('hidden');
    this.console.info('New scene created.');
  }

  // ── EXAMPLES ──────────────────────────────────────────
  _loadExample(name) {
    const code = EXAMPLES[name];
    if (!code) return;
    this.$('codeEditor').value = code;
    this.updateLineNumbers();
    this._run();
  }

  // ── HELP ──────────────────────────────────────────────
  _populateHelp() {
    this.$('helpContent').innerHTML = HELP_HTML;
  }

  // ── UTILITY ───────────────────────────────────────────
  $(id) { return document.getElementById(id); }
}

// ── BOOT ─────────────────────────────────────────────────
let app;
window.addEventListener('DOMContentLoaded', () => {
  app = new App();
});
