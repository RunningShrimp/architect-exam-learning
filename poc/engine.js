/* ============================================================
   城市场景引擎（POC，配置驱动）CityScene v0.1
   场景 = JSON 配置 + 本引擎（AI 维护配置而非场景代码——5B 实验）
   渲染降级链：WebGPU → WebGL2（three WebGPURenderer 自动回退）
              → Canvas2D（同配置的 2.5D 俯视）→ SVG（静态布局）
   用法：CityScene.boot(containerEl, configUrl, opts)
   opts: { onTier(tierName), onStats(stats), probe:true }
   URL 参数强制档位：?renderer=webgpu|webgl|canvas2d|svg
   ============================================================ */
(function () {
'use strict';

function q(name) {
  var m = new RegExp('[?&]' + name + '=([^&]*)').exec(location.search);
  return m ? decodeURIComponent(m[1]) : '';
}
function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }

/* ---------- 公共：HUD / 标签层 / FPS ---------- */
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

/* ---------- 主入口 ---------- */
async function boot(container, configUrl, opts) {
  opts = opts || {};
  container.classList.add('cs-root');
  var hud = makeHUD(container);
  var labels = makeLabels(container);
  var config = await (await fetch(configUrl, { cache: 'no-store' })).json();

  var forced = q('renderer');
  var tierNames = { webgpu: 'WebGPU', webgl: 'WebGL2（回退）', canvas2d: 'Canvas2D（回退）', svg: 'SVG（静态回退）' };
  var impl = null, tier = '';

  async function tryThree(forceGL) {
    var T = await import('three/webgpu');           /* import map → 自托管 vendor */
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
    if (forced !== 'svg') {
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

  /* FPS */
  var frames = 0, last = performance.now(), fps = 0;
  function fpsTick(now) {
    frames++;
    if (now - last >= 1000) { fps = frames; frames = 0; last = now; var f = hud.querySelector('.cs-fps'); if (f) f.textContent = fps + ' FPS'; if (opts.onStats) opts.onStats({ fps: fps }); }
    requestAnimationFrame(fpsTick);
  }
  requestAnimationFrame(fpsTick);

  /* 视觉探针（自动化视觉回归用）：配置里的 probe 点，投影取像素比对期望色 */
  window.CityProbe = {
    sample: function (points) {
      return impl.probe ? impl.probe(points || config.probe || []) : Promise.resolve([{ name: 'probe', ok: null, note: '该渲染层不支持像素探针' }]);
    }
  };
  return { tier: tier, config: config, impl: impl };
}

/* ---------- 共享数学：世界坐标 → 屏幕投影（标签/探针用） ---------- */
function projectStub() { return null; }

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
  /* 地面 + 道路 */
  var ground = new T.Mesh(new T.BoxGeometry(config.ground.size, 0.4, config.ground.size), mat(config.ground.color));
  ground.position.y = -0.2;
  scene.add(ground);
  (config.roads || []).forEach(function (r) {
    var m = new T.Mesh(new T.BoxGeometry(r.w, 0.06, r.d), mat(r.color || '#3a4664'));
    m.position.set(r.x, 0.03, r.z);
    scene.add(m);
  });
  /* 分区楼块 + 知识节点 */
  function addBox(b, pick) {
    var m = new T.Mesh(new T.BoxGeometry(b.w, b.h, b.d), mat(b.color));
    m.position.set(b.x, b.h / 2, b.z);
    if (pick) { m.userData.link = b.link; m.userData.label = b.label; pickables.push(m); }
    scene.add(m);
    return m;
  }
  (config.zones || []).forEach(function (z) { addBox(z, false); });
  (config.nodes || []).forEach(function (n) { addBox(n, !!n.link); });

  /* 相机轨道（手写：拖拽旋转 + 滚轮/双指缩放 + 阻尼） */
  var orbit = { theta: cam.theta || 0, phi: cam.phi || 0.9, r: cam.r || 70, target: new T.Vector3().fromArray(cam.target || [0, 0, 0]), vTheta: 0, vPhi: 0 };
  function applyCamera() {
    orbit.phi = Math.max(0.15, Math.min(1.45, orbit.phi));
    orbit.r = Math.max(12, Math.min(180, orbit.r));
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

  /* 动画钩子（POC-2 顾客流等由 config.anim 注册） */
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
    /* 帧内像素探针：WebGL 路径用 gl.readPixels（WebGPURenderer 的 canvas 是托管合成，
       drawImage/toDataURL 读不到内容——实测踩坑）；WebGPU 后端返回不支持（诚实降级） */
    if (window.__probeReq) {
      var req = window.__probeReq; window.__probeReq = null;
      var srcCvs = renderer.domElement;
      var gl = srcCvs.getContext('webgl2') || srcCvs.getContext('webgl');
      if (!gl) {
        req.resolve([{ name: 'probe', ok: null, note: 'WebGPU 后端不支持像素读取；视觉回归请用 ?renderer=webgl 档' }]);
      } else {
        var sxy = req.points.map(function (p) {
          var s = project(p.x, p.y, p.z);
          return {
            sx: Math.round(s.x * (srcCvs.width / srcCvs.clientWidth)),
            sy: gl.drawingBufferHeight - Math.round(s.y * (srcCvs.height / srcCvs.clientHeight)),
            p: p
          };
        });
        var outp = sxy.map(function (it) {
          var buf = new Uint8Array(4);
          gl.readPixels(it.sx, it.sy, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, buf);
          var ok = Math.abs(buf[0] - it.p.color[0]) < (it.p.tol || 60) && Math.abs(buf[1] - it.p.color[1]) < (it.p.tol || 60) && Math.abs(buf[2] - it.p.color[2]) < (it.p.tol || 60);
          return { name: it.p.name, ok: ok, got: [buf[0], buf[1], buf[2]], want: it.p.color };
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
      /* 探针请求排队到下一渲染帧内同步采样 */
      return new Promise(function (resolve) { window.__probeReq = { points: points, resolve: resolve }; });
    }
  };
}

/* ================================================================
   Canvas2D 回退（同配置 2.5D 俯视：等比投影的盒子）
   ================================================================ */
function canvas2dImpl(container, labels, config, hud) {
  var cvs = document.createElement('canvas');
  cvs.style.width = '100%'; cvs.style.height = '100%';
  container.insertBefore(cvs, labels);
  var ctx = cvs.getContext('2d');
  if (!ctx) throw new Error('no 2d');
  var view = { rot: -Math.PI / 4, zoom: 1, pan: { x: 0, y: 0 } };
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
    var g = iso(0, 0, 0);
    ctx.strokeStyle = config.ground.color; ctx.lineWidth = 1;
    ctx.strokeRect(g.x - config.ground.size * view.zoom / 2, g.y - config.ground.size * view.zoom / 4, config.ground.size * view.zoom, config.ground.size * view.zoom / 2);
    (config.roads || []).forEach(function (r) { box({ x: r.x, z: r.z, w: r.w, d: r.d, h: 0.1, color: r.color || '#3a4664' }); });
    (config.zones || []).concat(config.nodes || []).forEach(box);
    labels.innerHTML = (config.zones || []).map(function (z) {
      var p = iso(z.x, z.z, z.h + 2);
      return '<span class="cs-label" style="left:' + (p.x / cvs.clientWidth * 100) + '%;top:' + (p.y / cvs.clientHeight * 100) + '%">' + z.icon + ' ' + z.label + '</span>';
    }).join('');
    if (window.__cityAnim2d) window.__cityAnim2d(ctx, iso, view);
  }
  var drag = null, pinch = 0;
  cvs.style.touchAction = 'none';
  cvs.addEventListener('pointerdown', function (e) { drag = { x: e.clientX, y: e.clientY }; });
  cvs.addEventListener('pointermove', function (e) { if (drag) { view.pan.x += e.clientX - drag.x; view.pan.y += e.clientY - drag.y; drag = { x: e.clientX, y: e.clientY }; draw(); } });
  cvs.addEventListener('pointerup', function () { drag = null; });
  cvs.addEventListener('wheel', function (e) { e.preventDefault(); view.zoom *= (1 - Math.sign(e.deltaY) * 0.08); draw(); }, { passive: false });
  var raf = function () { draw(); setTimeout(function () { requestAnimationFrame(raf); }, 66); }; /* 15fps 足够 2D 俯视 */
  raf();
  return {
    probe: function (points) {
      return points.map(function (p) {
        var s = iso(p.x, p.z, p.y);
        var d = ctx.getImageData(Math.round(s.x * 2), Math.round(s.y * 2), 1, 1).data;
        var ok = Math.abs(d[0] - p.color[0]) < (p.tol || 40) && Math.abs(d[1] - p.color[1]) < (p.tol || 40);
        return { name: p.name, ok: ok, got: [d[0], d[1], d[2]], want: p.color };
      });
    }
  };
}

/* ================================================================
   SVG 静态回退（同配置的平面布局，无动画）
   ================================================================ */
function svgImpl(container, labels, config) {
  var W = 800, H = 440;
  var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%;display:block">';
  s += '<rect width="' + W + '" height="' + H + '" fill="' + config.mood.sky + '"/>';
  s += '<rect x="' + (W / 2 - config.ground.size * 2.4) + '" y="' + (H / 2 - config.ground.size * 1.2) + '" width="' + config.ground.size * 4.8 + '" height="' + config.ground.size * 2.4 + '" fill="' + config.ground.color + '" opacity=".6"/>';
  var scale = 2.4;
  function box(b) {
    s += '<rect x="' + (W / 2 + (b.x - b.w / 2) * scale) + '" y="' + (H / 2 + (b.z - b.d / 2) * scale) + '" width="' + Math.max(6, b.w * scale) + '" height="' + Math.max(6, b.d * scale) + '" fill="' + b.color + '" stroke="#0c1220"><title>' + (b.label || '') + '</title></rect>';
    if (b.label) s += '<text x="' + (W / 2 + b.x * scale) + '" y="' + (H / 2 + b.z * scale - 8) + '" text-anchor="middle" font-size="13" fill="#e8edf7">' + b.icon + ' ' + b.label + '</text>';
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
