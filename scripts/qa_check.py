#!/usr/bin/env python3
"""架构师学堂 · 页面契约自动验收脚本
用法: python3 scripts/qa_check.py [目录]
对照 docs/PAGE-SPEC.md 检查 kp/*.html 的结构、KP_CONF 一致性、内链与外链禁用。
"""
import json, re, sys, os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
IDX = json.loads((ROOT / "assets/kp-index.json").read_text(encoding="utf-8"))
POINTS = {p["id"]: p for p in IDX["points"]}
FILES = {p["id"]: f"{p['id']}-{p['slug']}.html" for p in IDX["points"]}

SECTION_IDS = [f"sec{i}" for i in range(1, 11)]
issues, stats = [], []

def check_page(path: Path):
    pid = path.name.split("-")[0]
    p = POINTS.get(pid)
    text = path.read_text(encoding="utf-8", errors="replace")
    errs, warns = [], []
    if not text.lstrip().lower().startswith("<!doctype html"):
        errs.append("缺 <!DOCTYPE html>")
    for sec in SECTION_IDS:
        if f'id="{sec}"' not in text:
            errs.append(f"缺段落 #{sec}")
    if "viewport" not in text:
        errs.append("缺 viewport meta")
    if 'href="../assets/style.css"' not in text or 'src="../assets/app.js"' not in text:
        errs.append("未引用共享 style.css/app.js")
    if 'id="tts-bar"' not in text:
        warns.append("缺 #tts-bar 朗读条")
    if 'id="feynman-input"' not in text:
        errs.append("缺费曼输入框")
    if 'id="kp-nav"' not in text:
        errs.append("缺 #kp-nav 上下页导航")
    # KP_CONF 一致性
    m = re.search(r"KP_CONF\s*=\s*\{(.*?)\};", text, re.S)
    conf = m.group(1) if m else ""
    def conf_field(f):
        mm = re.search(rf"\b{f}\s*:\s*['\"]([^'\"]*)['\"]", conf)
        return mm.group(1) if mm else None
    if conf_field("id") != pid:
        errs.append(f"KP_CONF.id={conf_field('id')} 应为 {pid}")
    if conf_field("domain") != (p["domain"] if p else None):
        errs.append("KP_CONF.domain 与索引不符")
    if conf_field("loc") is None:
        errs.append("KP_CONF.loc 缺失")
    ct = conf_field("title") or ""
    ct_clean = re.sub(r"^\d+\s*[·:]\s*", "", ct)
    if ct_clean != (p["title"] if p else None):
        warns.append("KP_CONF.title 与索引标题不一致(可接受于副题变化)")
    # prev/next
    seq = sorted(FILES)
    i = seq.index(pid)
    expect_prev = FILES[seq[i - 1]] if i > 0 else None
    expect_next = FILES[seq[i + 1]] if i < len(seq) - 1 else None
    got_prev = conf_field("prev")
    got_next = conf_field("next")
    if got_prev != expect_prev:
        errs.append(f"prev={got_prev} 应为 {expect_prev}")
    if got_next != expect_next:
        errs.append(f"next={got_next} 应为 {expect_next}")
    # 关键接线
    if not re.search(r"renderQuiz\(\s*['\"]#quiz-main['\"]", text):
        errs.append("缺 #quiz-main 随堂测试")
    if not re.search(rf"kpId\s*:\s*['\"]{pid}['\"]", text):
        errs.append("quiz-main 未传本页 kpId(影响SM-2)")
    if len(re.findall(r"renderCase\(", text)) < 2:
        errs.append("案例分析不足 2 道")
    if not re.search(r"mode\s*:\s*['\"]variant['\"]", text):
        errs.append("缺变式题(mode variant)")
    if not re.search(r"mode\s*:\s*['\"]recall['\"]", text):
        errs.append("缺前置点回忆题(mode recall)")
    if not re.search(r"makeAnim\(", text):
        errs.append("缺 makeAnim 动画")
    if not re.search(r"depChain\(", text):
        errs.append("缺 depChain 概念桥")
    if not re.search(r"keywords\s*:", conf):
        warns.append("KP_CONF.keywords 缺失(费曼自评不可用)")
    qcount = len(re.findall(r"\bq\s*:", text))
    if qcount < 8:
        warns.append(f"题目数据偏少(q字段 {qcount} 处)，确认 5+1+1 题齐全")
    # 外链禁用：src/href 指向 http(s)
    for val in re.findall(r'(?:src|href)=["\']([^"\']+)["\']', text):
        if val.startswith(("http://", "https://")):
            errs.append(f"外部资源引用: {val}")
    # 内链存在性
    for val in re.findall(r'href=["\']([^"\']+)["\']', text):
        if val.startswith(("#", "javascript:", "http")):
            continue
        target = (ROOT / "kp" / val) if not val.startswith("..") else (ROOT / val[3:])
        if not target.exists():
            errs.append(f"死链: {val}")
    # 字面 </script> 出现在 JS 字符串中会截断脚本（粗检：成对计数）
    if text.count("<script") != text.count("</script>"):
        errs.append("script 标签不成对")
    return errs, warns

def main():
    kpdir = ROOT / "kp"
    files = sorted(kpdir.glob("*.html")) if kpdir.exists() else []
    if not files:
        print("kp/ 下没有页面"); return 1
    for f in files:
        errs, warns = check_page(f)
        stats.append((f.name, len(errs), len(warns)))
        for e in errs:
            issues.append(f"[ERR] {f.name}: {e}")
        for w in warns:
            issues.append(f"[WARN] {f.name}: {w}")
    missing = [FILES[p["id"]] for p in IDX["points"] if not (kpdir / FILES[p["id"]]).exists()]
    for mfile in missing:
        issues.append(f"[MISS] 缺页面: {mfile}")
    # 根页面
    for rp in ["index.html", "review.html", "graph.html"]:
        if not (ROOT / rp).exists():
            issues.append(f"[MISS] 缺根页面 {rp}")
    total_e = sum(e for _, e, _ in stats)
    total_w = sum(w for _, _, w in stats)
    print(f"检查页面 {len(stats)} 个：ERR={total_e} WARN={total_w} 缺页={len(missing)}")
    for line in issues:
        print(line)
    return 0 if total_e == 0 and not missing else 1

if __name__ == "__main__":
    sys.exit(main())
