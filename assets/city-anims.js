/* ============================================================
   城市场景动画插件（与 assets/scene-engine.js 配合）
   CityAnims.flow：通用 waypoint 代理流（缓存分流/负载均衡/请求分层共用）
   cfg: {
     origin:[x,y,z], count, speed, spawnEvery,
     routes:[{ waypoints:[[x,y,z]...], color, weight?, speedMul? }]
   }
   返回：{ update(t,dt), setWeights([w...]), setRate(k), setCount(n) }
   ============================================================ */
window.CityAnims = window.CityAnims || {};
CityAnims.flow = function (T, scene, cfg) {
  var routes = cfg.routes;
  var weights = routes.map(function (r) { return r.weight != null ? r.weight : 1 / routes.length; });
  var count = cfg.count || 10;
  var spawnEvery = (cfg.spawnEvery || 0.45);
  var rateScale = 1;
  var pool = [];
  function mkAgent() {
    var m = new T.Mesh(new T.CapsuleGeometry(0.42, 0.8, 3, 8), new T.MeshLambertMaterial({ color: '#ffffff' }));
    m.visible = false; scene.add(m);
    return { mesh: m, active: false, route: 0, seg: 0, t: 0, lane: (Math.random() * 2 - 1) * (cfg.laneJitter || 1.4), dir: 1 };
  }
  for (var i = 0; i < count; i++) pool.push(mkAgent());
  function segLen(wp, s) {
    var a = wp[s], b = wp[s + 1];
    return Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) || 1;
  }
  var spawnAcc = 0;
  return {
    update: function (t, dt) {
      spawnAcc += dt * rateScale;
      if (spawnAcc > spawnEvery) {
        spawnAcc = 0;
        var c = pool.find(function (p) { return !p.active; });
        if (c) {
          var total = weights.reduce(function (a, b) { return a + b; }, 0);
          var pick = Math.random() * total, acc = 0, ri = routes.length - 1;
          for (var k = 0; k < routes.length; k++) { acc += weights[k]; if (pick <= acc) { ri = k; break; } }
          c.active = true; c.route = ri; c.seg = 0; c.t = 0; c.dir = 1;
          c.mesh.visible = true;
          c.mesh.material.color.set(routes[ri].color);
          c.mesh.scale.setScalar(1);
        }
      }
      pool.forEach(function (c) {
        if (!c.active) return;
        var R = routes[c.route];
        var len = segLen(R.waypoints, c.seg);
        c.t += dt * (cfg.speed || 0.5) * (R.speedMul || 1) / len;
        if (c.t >= 1) {
          c.t = 0;
          if (c.dir === 1 && c.seg < R.waypoints.length - 2) c.seg++;
          else if (c.dir === 1) { c.dir = -1; c.seg = R.waypoints.length - 2; }
          else if (c.seg > 0) c.seg--;
          else { c.active = false; c.mesh.visible = false; return; }
        }
        var a = R.waypoints[c.seg], b = R.waypoints[c.seg + 1];
        var k2 = c.dir === 1 ? c.t : 1 - c.t;
        c.mesh.position.set(
          a[0] + (b[0] - a[0]) * k2 + c.lane * 0.3,
          (a[1] + (b[1] - a[1]) * k2) + 0.75 + Math.abs(Math.sin(t * 7 + c.lane * 5)) * 0.12,
          a[2] + (b[2] - a[2]) * k2 + c.lane);
      });
    },
    setWeights: function (w) { w.forEach(function (v, i) { if (weights[i] != null) weights[i] = v; }); },
    setRate: function (k) { rateScale = k; },
    setCount: function (n) { /* 池固定大小，rate 控制密度 */ }
  };
};

/* 停车场 PV 信号量：车=进程，车位=资源，S=剩余车位（负数=排队数）
   cfg: { slots, arriveEvery, stay }
   返回：{ update, setSlots(n), stats() -> {free, queue, parked} } */
CityAnims.parking = function (T, scene, cfg) {
  var maxSlots = 8;
  var slots = Math.max(1, Math.min(maxSlots, cfg.slots || 4));
  var free = slots;
  var cars = [], pool = [];
  var carGeo = new T.BoxGeometry(1.1, 0.7, 2.0);
  var carColors = ['#4da3ff', '#4dd08c', '#ffb84d', '#ff8f9c', '#b39aff', '#6be0d2'];
  /* 车位标线（静态薄板，maxSlots 个，多余的隐藏） */
  var slotMarks = [];
  for (var s = 0; s < maxSlots; s++) {
    var mark = new T.Mesh(new T.BoxGeometry(2.2, 0.06, 2.6), new T.MeshLambertMaterial({ color: '#2e3a57' }));
    mark.position.set(14 + (s % 4) * 3, 0.06, 8 + Math.floor(s / 4) * 3.4);
    mark.visible = s < slots;
    scene.add(mark); slotMarks.push(mark);
  }
  function mkCar(id) {
    var m = new T.Mesh(carGeo, new T.MeshLambertMaterial({ color: carColors[id % carColors.length] }));
    m.visible = false; scene.add(m);
    return { mesh: m, active: false, state: 'arrive', t: 0, slot: -1, stay: 0, queueIdx: 0 };
  }
  for (var i = 0; i < (cfg.pool || 14); i++) pool.push(mkCar(i));
  var spawnAcc = 0;
  function laneX(t) { return -26 + t * 46; }
  return {
    update: function (t, dt) {
      spawnAcc += dt;
      if (spawnAcc > (cfg.arriveEvery || 1.1)) {
        spawnAcc = 0;
        var c = pool.find(function (p) { return !p.active; });
        if (c) { c.active = true; c.state = 'arrive'; c.t = 0; c.mesh.visible = true; }
      }
      var queueIdx = 0, parked = 0;
      /* 统计被占车位（用于 S 展示） */
      pool.forEach(function (c) {
        if (!c.active) return;
        if (c.state === 'parked') {
          parked++;
          c.stay -= dt;
          if (c.stay <= 0) { c.state = 'leave'; c.t = 0; }
        }
      });
      free = slots - parked;
      pool.forEach(function (c) {
        if (!c.active) return;
        var m = c.mesh;
        if (c.state === 'arrive') {
          c.t += dt * 0.5;
          m.position.set(laneX(Math.min(1, c.t)), 0.5, -6 + c.lane * 0);
          if (c.t >= 1) {
            if (free > 0) {
              free--; parked++;
              var idx = slotMarks.findIndex(function (mk, i2) { return i2 < slots && !pool.some(function (o) { return o.active && o.state === 'parked' && o.slot === i2; }); });
              c.slot = idx < 0 ? 0 : idx;
              c.state = 'enter'; c.t = 0;
            } else { c.state = 'queue'; c.queueIdx = queueIdx++; }
          }
        } else if (c.state === 'queue') {
          /* 顶部排队区：等待空位（V 操作时依次进场） */
          c.queueIdx = queueIdx; queueIdx++;
          m.position.set(-20 + c.queueIdx * 2.4, 0.5, -12);
          if (free > 0) {
            free--; parked++;
            var i2 = slotMarks.findIndex(function (mk, si) { return si < slots && !pool.some(function (o) { return o.active && o.state === 'parked' && o.slot === si; }); });
            c.slot = i2 < 0 ? 0 : i2;
            c.state = 'enter'; c.t = 0;
          }
        } else if (c.state === 'enter' || c.state === 'leave') {
          c.t += dt * 0.8;
          var from = c.state === 'enter' ? [-6, -6] : [14 + (c.slot % 4) * 3, 8 + Math.floor(c.slot / 4) * 3.4];
          var to = c.state === 'enter' ? [14 + (c.slot % 4) * 3, 8 + Math.floor(c.slot / 4) * 3.4] : [40, -6];
          var k = Math.min(1, c.t);
          m.position.set(from[0] + (to[0] - from[0]) * k, 0.5, from[1] + (to[1] - from[1]) * k);
          if (k >= 1) {
            if (c.state === 'enter') { c.state = 'parked'; c.stay = cfg.stay || 3; }
            else { c.active = false; m.visible = false; c.slot = -1; }
          }
        }
      });
      window.__parkStats = { free: free, slots: slots, parked: parked, queue: queueIdx };
    },
    setSlots: function (n) {
      slots = Math.max(1, Math.min(maxSlots, n));
      slotMarks.forEach(function (mk, i) { mk.visible = i < slots; });
    },
    stats: function () { return window.__parkStats || { free: slots, queue: 0, parked: 0 }; }
  };
};

/* 缓存雪崩：滑块=便利店存活率；存活越少，涌向超市（DB）的人越多
   cfg: { shops:[{x,z}...], mart:{x,z}, count }
   返回：{ update, setAlive(r) }  window.__surgeMart = 超市人数 */
CityAnims.surge = function (T, scene, cfg) {
  var aliveRatio = 1;
  var alive = cfg.shops.map(function () { return true; });
  var pool = [];
  var HOME = [-30, 1, 0], MART = [38, 1, -8];
  function mk() {
    var m = new T.Mesh(new T.CapsuleGeometry(0.42, 0.8, 3, 8), new T.MeshLambertMaterial({ color: '#e8edf7' }));
    m.visible = false; scene.add(m);
    return { mesh: m, active: false, t: 0, target: null };
  }
  for (var i = 0; i < (cfg.count || 16); i++) pool.push(mk());
  var spawnAcc = 0;
  function aliveCount() { return alive.filter(Boolean).length; }
  return {
    update: function (t, dt) {
      spawnAcc += dt;
      if (spawnAcc > 0.5) {
        spawnAcc = 0;
        var c = pool.find(function (p) { return !p.active; });
        if (c) {
          c.active = true; c.t = 0;
          var n = aliveCount();
          if (n === 0 || Math.random() > aliveRatio) { c.target = MART; c.mesh.material.color.set('#ff9aa5'); }
          else {
            var idxs = alive.map(function (a, i2) { return a ? i2 : -1; }).filter(function (i2) { return i2 >= 0; });
            var si = idxs[Math.floor(Math.random() * idxs.length)];
            c.target = [cfg.shops[si].x, 1, cfg.shops[si].z];
            c.mesh.material.color.set('#4dd08c');
          }
          c.mesh.visible = true;
        }
      }
      var atMart = 0;
      pool.forEach(function (c) {
        if (!c.active) return;
        c.t += dt * 0.12;
        if (c.t >= 1) { c.active = false; c.mesh.visible = false; return; }
        var k = Math.min(1, c.t);
        var wig = Math.sin(t * 6 + k * 9) * 0.8;
        c.mesh.position.set(
          HOME[0] + (c.target[0] - HOME[0]) * k,
          0.85 + Math.abs(Math.sin(t * 7 + k * 12)) * 0.12,
          HOME[2] + (c.target[2] - HOME[2]) * k + wig);
        if (c.target === MART && k > 0.85) atMart++;
      });
      window.__surgeMart = atMart;
    },
    setAlive: function (r) {
      aliveRatio = r;
      alive = alive.map(function (_, i) { return i < Math.round(r * alive.length); });
    }
  };
};

