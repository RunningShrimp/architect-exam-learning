#!/usr/bin/env python3
"""批量合成朗读音频（路线 A 落地）
narration/kp-NN.json -> audio/kp-NN-{i}.mp3 + .srt + audio/kp-NN.json 清单
特性：断点续跑（脚本或参数未变则跳过）、单段失败重试1次、请求间隔限速、
合成后统一用 ffmpeg 压到 32kbps 单声道控体积。
用法： ./.venv/bin/python scripts/synth_tts.py [--only NN,NN] [--shrink]
"""
import json, hashlib, subprocess, sys, time, pathlib, glob, re

VOICE = "zh-CN-XiaoxiaoNeural"
RATE = "-10%"
EDGE = "./.venv/bin/edge-tts"
AUDIO = pathlib.Path("audio")
HASHES = AUDIO / ".hashes.json"
SLEEP = 0.6

def ffmpeg_shrink(mp3: pathlib.Path):
    tmp = mp3.with_suffix(".tmp.mp3")
    r = subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(mp3),
                        "-codec:a", "libmp3lame", "-b:a", "24k", "-ac", "1", str(tmp)],
                       capture_output=True)
    if r.returncode == 0 and tmp.exists() and tmp.stat().st_size > 0:
        tmp.replace(mp3)
        return True
    if tmp.exists():
        tmp.unlink()
    return False

def synth_one(text: str, mp3: pathlib.Path, srt: pathlib.Path) -> bool:
    for attempt in (1, 2):
        r = subprocess.run([EDGE, "--voice", VOICE, "--rate", RATE,
                            "--text", text, "--write-media", str(mp3),
                            "--write-subtitles", str(srt)],
                           capture_output=True, timeout=300)
        if r.returncode == 0 and mp3.exists() and mp3.stat().st_size > 1000:
            return True
        time.sleep(2 * attempt)
    return False

def main():
    only = None
    shrink = "--shrink" in sys.argv
    for i, a in enumerate(sys.argv):
        if a == "--only":
            only = set(sys.argv[i + 1].split(","))
    AUDIO.mkdir(exist_ok=True)
    hashes = json.loads(HASHES.read_text()) if HASHES.exists() else {}
    files = sorted(glob.glob("narration/kp-*.json"))
    done = skip = fail = 0
    total_bytes = 0
    for f in files:
        nn = re.match(r"narration/kp-(\d+)\.json", f).group(1)
        if only and nn not in only:
            continue
        data = json.loads(open(f, encoding="utf-8").read())
        segs = data["segs"]
        manifest = {"v": 1, "voice": VOICE, "rate": RATE, "segs": []}
        page_ok = True
        for i, text in enumerate(segs, 1):
            mp3 = AUDIO / f"kp-{nn}-{i}.mp3"
            srt = AUDIO / f"kp-{nn}-{i}.srt"
            key = str(mp3)
            h = hashlib.sha1(f"{VOICE}|{RATE}|{text}".encode()).hexdigest()
            if mp3.exists() and hashes.get(key) == h and srt.exists():
                skip += 1
            else:
                if mp3.exists():
                    mp3.unlink()
                if not synth_one(text, mp3, srt):
                    print(f"❌ kp-{nn} 第{i}段合成失败")
                    page_ok = False
                    fail += 1
                    continue
                hashes[key] = h
                done += 1
                time.sleep(SLEEP)
            if shrink and mp3.exists() and hashes.get(key + ":shrunk") != h:
                if ffmpeg_shrink(mp3):
                    hashes[key + ":shrunk"] = h
                    time.sleep(0.05)
            manifest["segs"].append({"a": mp3.name, "s": srt.name, "text": text})
        (AUDIO / f"kp-{nn}.json").write_text(
            json.dumps(manifest, ensure_ascii=False), encoding="utf-8")
        page_bytes = sum((AUDIO / s["a"]).stat().st_size for s in manifest["segs"]
                         if (AUDIO / s["a"]).exists())
        total_bytes += page_bytes
        flag = "✅" if page_ok else "⚠️"
        print(f"{flag} kp-{nn}: {len(segs)}段 {page_bytes/1024:.0f}KB")
    HASHES.write_text(json.dumps(hashes))
    print(f"\n合成 {done} 段 / 跳过 {skip} 段 / 失败 {fail} 段；音频总量 {total_bytes/1024/1024:.1f} MB")

if __name__ == "__main__":
    main()
