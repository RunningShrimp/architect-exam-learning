/* ============================================================
   城市场景引擎（正式版）CityScene v1.0 —— ADR-001 GO 产物
   场景 = JSON 配置 + 本引擎（AI 只维护配置；新场景类型注册 CityAnims 插件）
   渲染降级链：WebGPU → WebGL2（three WebGPURenderer 自动回退）
              → Canvas2D（同配置 2.5D 俯视）→ SVG（静态布局）
   boot(container, configUrlOrObject, opts)
     opts.urls.webgpu  自定义 three webgpu 构建地址（默认 ../vendor/ 相对本文件）
     opts.onTier(tier) / opts.onStats({fps})
     强制档位：URL ?renderer=webgpu|webgl|canvas2d|svg
   配置 schema：
     mood/ground/camera/roads/zones/nodes[]（link=点击跳转）/edges[]（a,b 两端点，
     color/dashed）/anim[]（type → CityAnims 插件）/probe[]（自动视觉断言点）
   ============================================================ */
(function () {
'use strict';

function q(name) {
  var m = new RegExp('[?&]' + name + '=([^&]*)').exec(location.search);
  return m ? decodeURIComponent(m[1]) : '';
}
function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }

function makeHUD(container) {
  var hud = el('div', 'cs-hud');
  hud.innerHTML = '<span class="cs-tier">渲染层检测中…</span><span class="cs-fps"></span>' +
    '<span class="cs-tip">拖拽旋转 · 滚轮/双指缩放 · 点击建筑跳转</span>';
  container.appendChild(hud);
  return hud;
}
function makeLabels(container) {
  var layer = el('div', 'cs-labels');
  container.appendChild(layer);
  return layer;
}

async function boot(container, configOrUrl, opts) {
  opts = opts || {};
  container.classList.add('cs-root');
  var hud = makeHUD(container);
  var labels = makeLabels(container);
  var config = (typeof configOrUrl === 'string')
    ? await (await fetch(configOrUrl, { cache: 'no-store' })).json()
    : configOrUrl;

  var forced = q('renderer');
  var tierNames = { webgpu: 'WebGPU', webgl: 'WebGL2（回退）', canvas2d: 'Canvas2D（回退）', svg: 'SVG（静态回退）' };
  var impl = null, tier = '';

  var engImportSeq = 0;
  async function tryThree(forceGL) {
    var spec = (opts.urls && opts.urls.webgpu) || 'three/webgpu';
    if (opts.urls && opts.urls.webgpu) {
      engImportSeq++;
      spec += (spec.indexOf('?') < 0 ? '?' : '&') + 'engv=' + engImportSeq; /* 唯一化：绕开模块负缓存与SW旧键 */
    }
    var T;
    try {
      T = await import(/* webpackIgnore: true */ spec);
    } catch (e1) {
      var diag = '';
      try {
        if (opts.urls && opts.urls.webgpu) {
          var rr = await fetch(spec);
          diag = rr.status + ':' + (await rr.text()).slice(0, 48);
        }
      } catch (_e) { diag = 'diag-fail'; }
      throw new Error(String(e1).slice(0, 70) + ' ||诊断=' + diag);
    }
    var renderer = new T.WebGPURenderer({ antialias: true, forceWebGL: !!forceGL, preserveDrawingBuffer: true });
    await renderer.init();
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    container.insertBefore(renderer.domElement, labels);
    return { T: T, renderer: renderer };
  }

  try {
    if (forced === 'canvas2d') throw new Error('强制 Canvas2D 档');
    if (forced === 'svg') throw new Error('强制 SVG 档');
    var three = await tryThree(forced === 'webgl');
    impl = threeImpl(three.T, three.renderer, container, labels, config, hud);
    tier = three.renderer.backend.isWebGPUBackend ? 'WebGPU' : 'WebGL2（自动回退）';
  } catch (e3d) {
    /* WebGPU 探测偶发失败时，先重试一次纯 WebGL2，再落 Canvas2D/SVG */
    if (forced !== 'svg' && forced !== 'canvas2d') {
      try {
        var three2 = await tryThree(true);
        impl = threeImpl(three2.T, three2.renderer, container, labels, config, hud);
        tier = 'WebGL2（自动回退·重试）';
      } catch (e2) { /* 落入下方 2D */ }
    }
    if (!impl && forced !== 'svg') {
      try {
        impl = canvas2dImpl(container, labels, config, hud);
        tier = 'Canvas2D（回退）';
      } catch (e2d) { forced = 'svg'; }
    }
    if (forced === 'svg' || !impl) {
      impl = svgImpl(container, labels, config);
      tier = 'SVG（静态回退）';
    }
  }
  if (forced && tierNames[forced]) tier = tierNames[forced] + '（强制）';
  hud.querySelector('.cs-tier').textContent = '渲染层：' + tier;
  if (opts.onTier) opts.onTier(tier);

  var frames = 0, last = performance.now();
  function fpsTick(now) {
    frames++;
    if (now - last >= 1000) {
      var f = hud.querySelector('.cs-fps');
      if (f) f.textContent = frames + ' FPS';
      if (opts.onStats) opts.onStats({ fps: frames });
      frames = 0; last = now;
    }
    requestAnimationFrame(fpsTick);
  }
  requestAnimationFrame(fpsTick);

  window.CityProbe = {
    sample: function (points) {
      return impl.probe ? impl.probe(points || config.probe || []) : Promise.resolve([{ name: 'probe', ok: null, note: '该渲染层不支持像素探针' }]);
    }
  };
  return { tier: tier, config: config, impl: impl };
}

/* ================================================================
   3D 实现（three/webgpu：WebGPU 优先，WebGL2 自动回退）
   ================================================================ */
function threeImpl(T, renderer, container, labels, config, hud) {
  var scene = new T.Scene();
  scene.background = new T.Color(config.mood.sky);
  if (config.mood.fog) scene.fog = new T.Fog(config.mood.fog, 60, 260);
  var camera = new T.PerspectiveCamera(config.camera.fov || 50, container.clientWidth / container.clientHeight, 0.1, 500);
  var cam = config.camera;
  camera.position.set(cam.pos[0], cam.pos[1], cam.pos[2]);

  var ambient = new T.AmbientLight(config.mood.ambient, 1.1);
  var sun = new T.DirectionalLight(config.mood.sun, 2.2);
  sun.position.set(30, 60, 20);
  scene.add(ambient, sun);

  var matCache = {};
  function mat(color) {
    if (!matCache[color]) matCache[color] = new T.MeshLambertMaterial({ color: color });
    return matCache[color];
  }
  var pickables = [];
  if (config.ground) {
    var ground = new T.Mesh(new T.BoxGeometry(config.ground.size, 0.4, config.ground.size), mat(config.ground.color));
    ground.position.y = -0.2;
    scene.add(ground);
  }
  (config.roads || []).forEach(function (r) {
    var m = new T.Mesh(new T.BoxGeometry(r.w, 0.06, r.d), mat(r.color || '#3a4664'));
    m.position.set(r.x, 0.03, r.z);
    scene.add(m);
  });
  function addBox(b, pick) {
    var m = new T.Mesh(new T.BoxGeometry(b.w, b.h, b.d), mat(b.color));
    m.position.set(b.x, b.h / 2, b.z);
    if (pick) { m.userData.link = b.link; m.userData.label = b.label; pickables.push(m); }
    scene.add(m);
    return m;
  }
  (config.zones || []).forEach(function (z) { addBox(z, false); });
  (config.nodes || []).forEach(function (n) { addBox(n, !!n.link); });

  /* 边：实线（依赖）与虚线（关联） */
  var solid = [], dashed = [];
  (config.edges || []).forEach(function (e) {
    (e.dashed ? dashed : solid).push(e);
  });
  function addLines(list, color, dashedM) {
    if (!list.length) return;
    var pos = new Float32Array(list.length * 6), dst = null;
    list.forEach(function (e, i) {
      pos.set(e.a, i * 6); pos.set(e.b, i * 6 + 3);
    });
    var g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(pos, 3));
    var m;
    if (dashedM) {
      dst = new Float32Array(list.length * 2);
      list.forEach(function (e, i) {
        var len = Math.hypot(e.b[0]-e.a[0], e.b[1]-e.a[1], e.b[2]-e.a[2]);
        dst[i*2] = 0; dst[i*2+1] = len;
      });
      g.setAttribute('lineDistance', new T.BufferAttribute(dst, 1));
      m = new T.LineSegments(g, new T.LineDashedMaterial({ color: color, dashSize: 1.2, gapSize: 1.0, transparent: true, opacity: .5 }));
    } else {
      m = new T.LineSegments(g, new T.LineBasicMaterial({ color: color, transparent: true, opacity: .55 }));
    }
    scene.add(m);
  }
  addLines(solid, '#4da3ff', false);
  addLines(dashed, '#ffb84d', true);

  /* 相机轨道（手写：拖拽旋转 + 滚轮/双指缩放） */
  var orbit = { theta: cam.theta || 0, phi: cam.phi || 0.9, r: cam.r || 70, target: new T.Vector3().fromArray(cam.target || [0, 0, 0]) };
  function applyCamera() {
    orbit.phi = Math.max(0.15, Math.min(1.45, orbit.phi));
    orbit.r = Math.max(12, Math.min(220, orbit.r));
    camera.position.set(
      orbit.target.x + orbit.r * Math.sin(orbit.phi) * Math.sin(orbit.theta),
      orbit.target.y + orbit.r * Math.cos(orbit.phi),
      orbit.target.z + orbit.r * Math.sin(orbit.phi) * Math.cos(orbit.theta));
    camera.lookAt(orbit.target);
  }
  var drag = null, pinch = 0;
  var cvs = renderer.domElement;
  cvs.style.touchAction = 'none';
  cvs.addEventListener('pointerdown', function (e) { drag = { x: e.clientX, y: e.clientY, moved: 0 }; cvs.setPointerCapture(e.pointerId); });
  cvs.addEventListener('pointermove', function (e) {
    if (!drag) return;
    var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    drag.moved += Math.abs(dx) + Math.abs(dy);
    orbit.theta -= dx * 0.005; orbit.phi -= dy * 0.004;
    drag.x = e.clientX; drag.y = e.clientY;
  });
  cvs.addEventListener('pointerup', function (e) {
    if (drag && drag.moved < 6) tapPick(e);
    drag = null;
  });
  cvs.addEventListener('wheel', function (e) { e.preventDefault(); orbit.r *= (1 + Math.sign(e.deltaY) * 0.08); }, { passive: false });
  cvs.addEventListener('touchmove', function (e) {
    if (e.touches.length === 2) {
      var d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      if (pinch) orbit.r *= pinch / d;
      pinch = d;
    }
  }, { passive: false });
  cvs.addEventListener('touchend', function () { pinch = 0; });

  var ray = new T.Raycaster(), ndc = new T.Vector2();
  function tapPick(e) {
    var r = cvs.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    var hit = ray.intersectObjects(pickables, false)[0];
    if (hit && hit.object.userData.link) location.href = hit.object.userData.link;
  }

  var anims = [];
  (config.anim || []).forEach(function (a) { if (window.CityAnims && window.CityAnims[a.type]) anims.push(window.CityAnims[a.type](T, scene, a)); });

  var clock = new T.Clock();
  var labelCfg = config.labels !== false;
  var lastT = 0;
  function frame() {
    var t = clock.getElapsedTime();
    var dt = Math.min(0.05, t - lastT); lastT = t;
    anims.forEach(function (a) { if (a.update) a.update(t, dt); });
    applyCamera();
    renderer.render(scene, camera);
    /* 帧内像素探针：WebGL 路径 gl.readPixels；WebGPU 后端不支持（诚实降级） */
    if (window.__probeReq) {
      var req = window.__probeReq; window.__probeReq = null;
      var srcCvs = renderer.domElement;
      var gl = srcCvs.getContext('webgl2') || srcCvs.getContext('webgl');
      if (!gl) {
        req.resolve([{ name: 'probe', ok: null, note: 'WebGPU 后端不支持像素读取；视觉回归请用 ?renderer=webgl 档' }]);
      } else {
        var outp = req.points.map(function (p) {
          var s = project(p.x, p.y, p.z);
          var sx = Math.round(s.x * (srcCvs.width / srcCvs.clientWidth));
          var sy = gl.drawingBufferHeight - Math.round(s.y * (srcCvs.height / srcCvs.clientHeight));
          var buf = new Uint8Array(4);
          gl.readPixels(sx, sy, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, buf);
          var ok = Math.abs(buf[0] - p.color[0]) < (p.tol || 60) && Math.abs(buf[1] - p.color[1]) < (p.tol || 60) && Math.abs(buf[2] - p.color[2]) < (p.tol || 60);
          return { name: p.name, ok: ok, got: [buf[0], buf[1], buf[2]], want: p.color };
        });
        req.resolve(outp);
      }
    }
    /* 标签投影（CSS 覆盖层，两渲染层通用） */
    if (labelCfg) {
      var html = '';
      (config.zones || []).forEach(function (z) {
        var v = new T.Vector3(z.x, z.h + 2, z.z).project(camera);
        if (v.z < 1) html += '<span class="cs-label" style="left:' + ((v.x * 0.5 + 0.5) * 100) + '%;top:' + ((-v.y * 0.5 + 0.5) * 100) + '%">' + z.icon + ' ' + z.label + '</span>';
      });
      (config.nodes || []).forEach(function (n) {
        var v = new T.Vector3(n.x, n.h + 2, n.z).project(camera);
        if (v.z < 1) html += '<span class="cs-label" style="left:' + ((v.x * 0.5 + 0.5) * 100) + '%;top:' + ((-v.y * 0.5 + 0.5) * 100) + '%">' + n.icon + ' ' + n.label + '</span>';
      });
      labels.innerHTML = html;
    }
  }
  renderer.setAnimationLoop(frame);
  new ResizeObserver(function () {
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
  }).observe(container);

  function project(x, y, z) {
    var v = new T.Vector3(x, y, z).project(camera);
    var r = renderer.domElement.getBoundingClientRect();
    return { x: r.left + (v.x * 0.5 + 0.5) * r.width, y: r.top + (-v.y * 0.5 + 0.5) * r.height };
  }
  return {
    anims: anims,
    probe: function (points) {
      return new Promise(function (resolve) { window.__probeReq = { points: points, resolve: resolve }; });
    }
  };
}

/* ================================================================
   Canvas2D 回退（同配置 2.5D 俯视）
   ================================================================ */
function canvas2dImpl(container, labels, config, hud) {
  var cvs = document.createElement('canvas');
  cvs.style.width = '100%'; cvs.style.height = '100%';
  container.insertBefore(cvs, labels);
  var ctx = cvs.getContext('2d');
  if (!ctx) throw new Error('no 2d');
  var view = { rot: -Math.PI / 4, zoom: 1 };
  function iso(x, z, y) {
    var c = Math.cos(view.rot), s = Math.sin(view.rot);
    var rx = x * c - z * s, rz = x * s + z * c;
    return { x: cvs.clientWidth / 2 + rx * view.zoom, y: cvs.clientHeight / 2 + rz * view.zoom * 0.5 - y * view.zoom };
  }
  function box(b) {
    var p1 = iso(b.x - b.w / 2, b.z - b.d / 2, 0), p2 = iso(b.x + b.w / 2, b.z + b.d / 2, 0), pt = iso(b.x + b.w / 2, b.z + b.d / 2, b.h);
    ctx.fillStyle = b.color; ctx.globalAlpha = 0.92;
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.lineTo(pt.x, pt.y);
    ctx.lineTo(2 * p1.x - p2.x + (pt.x - p2.x), 2 * p1.y - p2.y + (pt.y - p2.y));
    ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 1;
  }
  function draw() {
    cvs.width = container.clientWidth * 2; cvs.height = container.clientHeight * 2;
    ctx.scale(2, 2);
    ctx.fillStyle = config.mood.sky; ctx.fillRect(0, 0, cvs.clientWidth, cvs.clientHeight);
    if (config.ground) {
      var g = iso(0, 0, 0);
      ctx.strokeStyle = config.ground.color; ctx.lineWidth = 1;
      ctx.strokeRect(g.x - config.ground.size * view.zoom / 2, g.y - config.ground.size * view.zoom / 4, config.ground.size * view.zoom, config.ground.size * view.zoom / 2);
    }
    (config.edges || []).forEach(function (e) {
      var a = iso(e.a[0], e.a[2], e.a[1]), b = iso(e.b[0], e.b[2], e.b[1]);
      ctx.strokeStyle = e.color || (e.dashed ? '#ffb84d' : '#4da3ff');
      ctx.setLineDash(e.dashed ? [4, 4] : []);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.setLineDash([]);
    });
    (config.roads || []).forEach(function (r) { box({ x: r.x, z: r.z, w: r.w, d: r.d, h: 0.1, color: r.color || '#3a4664' }); });
    (config.zones || []).concat(config.nodes || []).forEach(box);
    labels.innerHTML = (config.zones || []).concat(config.nodes || []).map(function (z) {
      var p = iso(z.x, z.z, z.h + 2);
      return '<span class="cs-label" style="left:' + (p.x / cvs.clientWidth * 100) + '%;top:' + (p.y / cvs.clientHeight * 100) + '%">' + (z.icon ? z.icon + ' ' : '') + (z.label || '') + '</span>';
    }).join('');
    if (window.__cityAnim2d) { try { window.__cityAnim2d(ctx, iso, view); } catch (e2a) { /* 单帧动画异常不终止绘制循环 */ } }
  }
  var drag = null, pinch = 0;
  cvs.style.touchAction = 'none';
  cvs.addEventListener('pointerdown', function (e) { drag = { x: e.clientX, y: e.clientY }; });
  cvs.addEventListener('pointermove', function (e) { if (drag) { view.zoom = view.zoom; drag = { x: e.clientX, y: e.clientY }; draw(); } });
  cvs.addEventListener('pointerup', function () { drag = null; });
  cvs.addEventListener('wheel', function (e) { e.preventDefault(); view.zoom *= (1 - Math.sign(e.deltaY) * 0.08); draw(); }, { passive: false });
  var raf = function () { draw(); setTimeout(function () { requestAnimationFrame(raf); }, 66); };
  raf();
  return {
    probe: function (points) {
      return points.map(function (p) {
        var s = iso(p.x, p.z, p.y);
        var d = ctx.getImageData(Math.round(s.x * 2), Math.round(s.y * 2), 1, 1).data;
        var ok = Math.abs(d[0] - p.color[0]) < (p.tol || 60) && Math.abs(d[1] - p.color[1]) < (p.tol || 60);
        return { name: p.name, ok: ok, got: [d[0], d[1], d[2]], want: p.color };
      });
    }
  };
}

/* ================================================================
   SVG 静态回退
   ================================================================ */
function svgImpl(container, labels, config) {
  var W = 800, H = 440;
  var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%;display:block">';
  s += '<rect width="' + W + '" height="' + H + '" fill="' + config.mood.sky + '"/>';
  var scale = 2.4;
  if (config.ground) s += '<rect x="' + (W / 2 - config.ground.size * scale) + '" y="' + (H / 2 - config.ground.size * 0.5 * scale) + '" width="' + config.ground.size * 2 * scale + '" height="' + config.ground.size * scale + '" fill="' + config.ground.color + '" opacity=".6"/>';
  function line(e) {
    s += '<line x1="' + (W / 2 + e.a[0] * scale) + '" y1="' + (H / 2 + e.a[2] * scale) + '" x2="' + (W / 2 + e.b[0] * scale) + '" y2="' + (H / 2 + e.b[2] * scale) + '" stroke="' + (e.color || (e.dashed ? '#ffb84d' : '#4da3ff')) + '" stroke-width="1" ' + (e.dashed ? 'stroke-dasharray="4 4"' : '') + ' opacity=".6"/>';
  }
  (config.edges || []).forEach(line);
  function box(b) {
    s += '<rect x="' + (W / 2 + (b.x - b.w / 2) * scale) + '" y="' + (H / 2 + (b.z - b.d / 2) * scale) + '" width="' + Math.max(6, b.w * scale) + '" height="' + Math.max(6, b.d * scale) + '" fill="' + b.color + '" stroke="#0c1220"><title>' + (b.label || '') + '</title></rect>';
    if (b.label) s += '<text x="' + (W / 2 + b.x * scale) + '" y="' + (H / 2 + b.z * scale - 8) + '" text-anchor="middle" font-size="13" fill="#e8edf7">' + (b.icon ? b.icon + ' ' : '') + b.label + '</text>';
  }
  (config.roads || []).forEach(box);
  (config.zones || []).forEach(box);
  (config.nodes || []).forEach(function (n) {
    box(n);
    if (n.link) s += '<a href="' + n.link + '"><rect x="' + (W / 2 + (n.x - n.w / 2) * scale) + '" y="' + (H / 2 + (n.z - n.d / 2) * scale) + '" width="' + Math.max(10, n.w * scale) + '" height="' + Math.max(10, n.d * scale) + '" fill="transparent"/></a>';
  });
  s += '<text x="12" y="' + (H - 12) + '" font-size="12" fill="#9aa8c4">SVG 静态回退层：低能力设备保底，仍保留隐喻与跳转</text></svg>';
  var wrap = el('div', 'citymap');
  wrap.innerHTML = s;
  container.insertBefore(wrap, labels);
  labels.innerHTML = '';
  return { probe: null };
}

window.CityScene = { boot: boot };
})();
