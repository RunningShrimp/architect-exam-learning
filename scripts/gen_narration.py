#!/usr/bin/env python3
"""朗读脚本生成器（路线 C 落地）
kp/NN-*.html -> narration/kp-NN.txt(人读) + narration/kp-NN.json(机读) + 页面内嵌 <script id="kp-narration">
规则：知识卡片全文口语化；表格永不直读，按「总述→报列头→逐行对比句→收尾提醒」转写。
幂等：重复运行会替换旧的内嵌块。
"""
import glob, json, re, hashlib
from html import unescape
from html.parser import HTMLParser

VOICE = "zh-CN-XiaoxiaoNeural"
RATE = "-10%"

# ---------- 符号口语化（与前端 ttsSpeakable 同映射） ----------
SYMBOL_MAP = [("×", " 乘以 "), ("÷", " 除以 "), ("→", " 到 "), ("↔", " 与 "), ("≥", " 不小于 "),
              ("≤", " 不大于 "), ("≠", " 不等于 "), ("≈", " 约等于 "), ("vs", "对比"), ("VS", "对比"),
              ("&", " 和 "), ("——", "，"), ("·", "，"),
              ("①", "第一，"), ("②", "第二，"), ("③", "第三，"), ("④", "第四，"), ("⑤", "第五，"),
              ("⑥", "第六，"), ("⑦", "第七，"), ("⑧", "第八，"), ("⑨", "第九，"), ("⑩", "第十，"),
              ("∑", "求和 "), ("∏", "连乘 "), ("√", "根号 "),
              ("★★★★★", "5星"), ("★★★★", "4星"), ("★★★", "3星"), ("★★", "2星"), ("★", "1星"),
              ("◆◆◆◆◆", "5星"), ("◆◆◆◆", "4星"), ("◆◆◆", "3星"), ("◆◆", "2星"), ("◆", "1星")]

def speakable(t: str) -> str:
    t = unescape(t)
    t = re.sub(r"[\U0001F000-\U0001FAFF\u2600-\u27BF\u2900-\u297F\uFE0F\u2B00-\u2BFF]", "", t)
    for a, b in SYMBOL_MAP:
        t = t.replace(a, b)
    t = re.sub(r"=+\s*", " 等于 ", t)
    t = re.sub(r"\s+", " ", t)
    t = re.sub(r"([：，、；])。+", r"\1", t)   # 结构标点叠加：冒号/顿号后不再加句号
    t = re.sub(r"。{2,}", "。", t)
    return t.strip()

# ---------- 极简 DOM 树 ----------
class Node:
    def __init__(self, tag=None, text=""):
        self.tag, self.text, self.attrs, self.children = tag, text, {}, []
    def cls(self):
        return self.attrs.get("class", "")

class TreeBuilder(HTMLParser):
    VOID = {"br", "img", "hr", "meta", "link", "input"}
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.root = Node("root")
        self.stack = [self.root]
    def handle_starttag(self, tag, attrs):
        n = Node(tag)
        n.attrs = dict(attrs)
        self.stack[-1].children.append(n)
        if tag not in self.VOID:
            self.stack.append(n)
    def handle_startendtag(self, tag, attrs):
        n = Node(tag); n.attrs = dict(attrs)
        self.stack[-1].children.append(n)
    def handle_endtag(self, tag):
        for i in range(len(self.stack) - 1, 0, -1):
            if self.stack[i].tag == tag:
                del self.stack[i:]
                break
    def handle_data(self, data):
        if data:
            self.stack[-1].children.append(Node("#text", data))

def parse(html: str) -> Node:
    b = TreeBuilder()
    b.feed(html)
    return b.root

def find_by_id(node: Node, rid: str):
    if node.attrs.get("id") == rid:
        return node
    for c in node.children:
        r = find_by_id(c, rid)
        if r:
            return r
    return None

def text_of(n: Node) -> str:
    if n.tag is None or n.tag == "#text":
        return n.text
    return "".join(text_of(c) for c in n.children)

# ---------- 表格转写（路线 C 规则） ----------
TABLE_CLOSINGS = [
    "表格就是这些，抓住每行的差异点，就抓住了考点。",
    "这张表就过到这里，注意各行之间的分界线。",
    "对照着听一遍，比死记条文记得牢。",
]

def table_speech(tbl: Node, idx: int = 0) -> str:
    rows = []
    def collect(n):
        if n.tag == "tr":
            rows.append(n)
        for c in n.children:
            collect(c)
    collect(tbl)
    grid = []
    for r in rows:
        cells = [speakable(text_of(c)) for c in r.children if c.tag in ("td", "th")]
        if any(cells):
            grid.append(cells)
    if not grid:
        return ""
    header = grid[0]
    body = grid[1:]
    if header and header[0] == "":
        header[0] = "对比项"
    col_heads = [re.sub(r"（[^）]*）", "", h).strip() or h for h in header[1:]] if len(header) > 1 else header
    col_heads = ["例子" if h == "例" else h for h in col_heads]
    lines = ["来看一张对照表。"]
    if col_heads:
        lines.append("表的栏目有：" + "、".join(h for h in col_heads if h) + "。")
    for cells in body:
        head = cells[0] or "这一行"
        pairs = []
        for h, c in zip(col_heads, cells[1:]):
            if not c:
                continue
            pairs.append(f"{h or '要点'}是{c}")
        if pairs:
            lines.append(f"先看{head}：" + "；".join(pairs) + "。")
        elif len(cells) == 1:
            lines.append(head + "。")
    flat = "".join(grid[i][j] for i in range(len(grid)) for j in range(len(grid[i])))
    if "失效" in flat:
        lines.append("特别注意：表里标了失效边界的地方，就是最容易考反的地方，务必分清。")
    else:
        lines.append(TABLE_CLOSINGS[idx % len(TABLE_CLOSINGS)])
    return "".join(lines)

# ---------- 块 → 口语文本 ----------
MAX_SEG = 1100

def block_speech(n: Node, out: list, tbl_idx):
    if n.tag == "#text":
        t = speakable(n.text)
        if t:
            out.append(t if t.endswith(("。", "！", "？", "；")) else t + ("。" if len(t) > 1 else ""))
        return
    if n.tag == "table":
        s = table_speech(n, tbl_idx[0])
        tbl_idx[0] += 1
        if s:
            out.append(s)
        return
    if n.tag in ("script", "style"):
        return
    if n.tag == "br":
        out.append("，")
        return
    if n.tag in ("h1", "h2", "h3", "h4"):
        t = speakable(text_of(n))
        if t:
            out.append(f"{t}。")
        return
    if n.tag == "li":
        t = speakable(text_of(n))
        if t:
            out.append(t + "。")
        return
    for c in n.children:
        block_speech(c, out, tbl_idx)

def split_long(paras: list) -> list:
    segs, buf = [], ""
    for p in paras:
        if len(buf) + len(p) > MAX_SEG and buf:
            segs.append(buf.strip()); buf = ""
        buf += p
    if buf.strip():
        segs.append(buf.strip())
    return [s for s in segs if s]

def kc_segments(kc: Node, title: str, nn: str) -> list:
    intro = f"第{int(nn)}站，{speakable(title)}。下面朗读知识卡片。"
    paras = [intro]
    tbl_idx = [0]
    for c in kc.children:
        if c.tag == "h3":
            paras.append("小节，" + speakable(text_of(c)) + "。")
        else:
            block_speech(c, paras, tbl_idx)
    return split_long(paras)

# ---------- 主流程 ----------
def main():
    Path = __import__("pathlib").Path
    import pathlib
    out_dir = pathlib.Path("narration"); out_dir.mkdir(exist_ok=True)
    total_chars, page_chars = 0, []
    for f in sorted(glob.glob("kp/*.html")):
        nn = re.match(r"kp/(\d+)-", f).group(1)
        html = open(f, encoding="utf-8").read()
        m = re.search(r"<title>(\d+) · (.+?) ·", html)
        title = m.group(2) if m else ""
        tree = parse(html)
        kc = find_by_id(tree, "kc-text")
        if kc is None:
            print(f"⚠️ {f} 无 kc-text，跳过")
            continue
        segs = kc_segments(kc, title, nn)
        # 人读版
        txt = "\n\n".join(f"〔第{i}段〕\n{s}" for i, s in enumerate(segs, 1))
        (out_dir / f"kp-{nn}.txt").write_text(txt, encoding="utf-8")
        # 机读版
        (out_dir / f"kp-{nn}.json").write_text(
            json.dumps({"v": 1, "voice": VOICE, "rate": RATE, "segs": segs}, ensure_ascii=False), encoding="utf-8")
        # 页面内嵌（L2 数据源，file:// 也可用）
        embed = ('<!-- narration:start -->\n<script type="application/json" id="kp-narration">'
                 + json.dumps({"v": 1, "segs": segs}, ensure_ascii=False).replace("</", "<\\/")
                 + '</script>\n<!-- narration:end -->\n')
        html2 = re.sub(r"<!-- narration:start -->[\s\S]*?<!-- narration:end -->\n?", "", html)
        html2 = html2.replace("<script>\nwindow.KP_CONF", embed + "<script>\nwindow.KP_CONF", 1)
        assert html2 != html or embed in html, f"嵌入点未找到: {f}"
        if html2 != html:
            open(f, "w", encoding="utf-8").write(html2)
        n = sum(len(s) for s in segs)
        total_chars += n; page_chars.append((nn, n, len(segs)))
        print(f"kp-{nn}: {len(segs)} 段 / {n} 字")
    page_chars.sort(key=lambda x: -x[1])
    print(f"\n合计 {total_chars} 字；最长页 {page_chars[0]}; 预计音频时长 ≈ {total_chars/4.3/3600:.1f} 小时")
    print(f"48kbps ≈ {total_chars/4.3*6/1024/1024:.0f} MB → 32kbps ≈ {total_chars/4.3*4/1024/1024:.0f} MB")

if __name__ == "__main__":
    main()
