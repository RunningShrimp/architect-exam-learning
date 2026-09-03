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
