#!/usr/bin/env python3
"""生成 3D 知识图谱配置：assets/configs/scene-graph3d.json
数据源 assets/kp-index.json（62 点/11 域）。布局：11 个域分区排在城市四条横带，
域内节点 3 列网格；deps=实线边，rel=虚线边。重跑即再生（配置驱动，AI 免改代码）。
"""
import json, math
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
idx = json.loads((ROOT / "assets/kp-index.json").read_text(encoding="utf-8"))

# 域分区中心（城市隐喻方位，与首页地图分区呼应）
DISTRICTS = {
    "hw":    (-30, -26), "os": (0, -26),   "db": (30, -26),
    "net":   (-32, 0),   "arch": (0, 0),   "se": (32, 0),
    "qa":    (-30, 26),  "pt": (0, 26),    "sec": (30, 26),
    "pm":    (-15, 46),  "trend": (17, 46)
}
PALETTE = {
    "hw": "#8fb4ff", "os": "#9aa8ff", "db": "#ffd97a", "net": "#6bd5ff", "se": "#e0a884",
    "arch": "#ffb84d", "qa": "#7fe0a8", "pt": "#b39aff", "sec": "#ff8f9c", "pm": "#d8c07a", "trend": "#6be0d2"
}

zones, nodes = [], []
pos = {}
for dk, (cx, cz) in DISTRICTS.items():
    d = idx["domains"][dk]
    zones.append({"id": "z-" + dk, "label": d["name"], "icon": d["icon"],
                  "x": cx, "z": cz - 6, "w": 18, "d": 12, "h": 0.5, "color": "#1f2a42"})
    pts = [p for p in idx["points"] if p["domain"] == dk]
    pts.sort(key=lambda p: p["id"])
    for i, p in enumerate(pts):
        col, row = i % 3, i // 3
        x = cx + (col - 1) * 5.2
        z = cz + row * 4.6
        h = 1.2 + p["freq"] * 0.5          # 考频越高楼越高
        nodes.append({"id": p["id"], "x": round(x, 1), "z": round(z, 1),
                      "w": 2, "d": 2, "h": round(h, 1), "color": PALETTE[dk],
                      "label": f"{p['id']} {p['title']}", "link": f"kp/{p['id']}-{p['slug']}.html"})
        pos[p["id"]] = [x, h / 2, z]

edges = []
for p in idx["points"]:
    for dep in p.get("deps", []):
        if dep in pos:
            edges.append({"a": pos[dep], "b": pos[p["id"]], "color": "#4da3ff"})
    for rel in p.get("rel", []):
        if rel in pos:
            edges.append({"a": pos[p["id"]], "b": pos[rel], "color": "#ffb84d", "dashed": True})

out = {
    "meta": {"scene": "graph3d", "generated_by": "scripts/gen_graph3d.py", "version": 1},
    "mood": {"sky": "#101828", "ambient": "#8899cc", "sun": "#ffe0b0"},
    "camera": {"fov": 55, "theta": 0.8, "phi": 0.72, "r": 132, "target": [0, 0, 8], "pos": [60, 60, 60]},
    "ground": None,
    "zones": zones, "nodes": nodes, "edges": edges,
    "labels": True
}
(ROOT / "assets/configs/scene-graph3d.json").write_text(
    json.dumps(out, ensure_ascii=False), encoding="utf-8")
print(f"scene-graph3d.json: {len(nodes)} 节点 / {len(zones)} 域 / {len(edges)} 边")
