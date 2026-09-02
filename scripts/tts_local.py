#!/usr/bin/env python3
"""本地轻量合成后端（路线 A 的离线替代/备份引擎）
引擎：sherpa-onnx + Kokoro-82M v1.1-zh (int8, Apache-2.0)
用法：
  # 单段试听
  ./.venv/bin/python scripts/tts_local.py --text "你好，架构师学堂。" --out /tmp/a.wav
  # 整站重合成（输出到 audio-local/，试听满意后可替换 audio/）
  ./.venv/bin/python scripts/tts_local.py --all [--sid 3] [--speed 0.9]
说明：模型放 /tmp/kokoro 或用 --model-dir 指定（含 model.int8.onnx / voices.bin /
tokens.txt / espeak-ng-data / dict / lexicon-*.txt / *.fst）。
"""
import argparse, json, pathlib, time, subprocess, sys, os

DEFAULT_DIR = "/tmp/kokoro"

def build_tts(model_dir, sid):
    import sherpa_onnx
    d = pathlib.Path(model_dir)
    # fp32 优先（int8 内核在部分 macOS/arm64 ORT 构建下会输出 NaN，实测 2026-09-02）
    model = d / "model.onnx"
    if not model.exists():
        model = d / "model.int8.onnx"
    kokoro = sherpa_onnx.OfflineTtsKokoroModelConfig(
        model=str(model),
        voices=str(d / "voices.bin"),
        tokens=str(d / "tokens.txt"),
        data_dir=str(d / "espeak-ng-data"),
        dict_dir=str(d / "dict"),
        lexicon=str(d / "lexicon-zh.txt"),
    )
    cfg = sherpa_onnx.OfflineTtsConfig(
        model=sherpa_onnx.OfflineTtsModelConfig(kokoro=kokoro),
        rule_fsts=",".join(str(d / x) for x in ("date-zh.fst", "number-zh.fst", "phone-zh.fst")),
        max_num_sentences=1,
    )
    tts = sherpa_onnx.OfflineTts(cfg)
    if not (0 <= sid < tts.num_speakers):
        raise SystemExit(f"sid 越界（可用 0~{tts.num_speakers-1}）")
    return tts

def gen_wav(tts, text, sid, speed, out):
    import array
    t0 = time.time()
    audio = tts.generate(text, sid=sid, speed=speed)
    dt = time.time() - t0
    n = len(audio.samples)
    dur = n / audio.sample_rate
    if hasattr(audio.samples, "astype"):
        data = audio.samples.astype("int16").tobytes()
    else:
        data = array.array("h", [int(x) for x in audio.samples]).tobytes()
    import wave
    with wave.open(out, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(audio.sample_rate)
        w.writeframes(data)
    return dur, dt

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--text")
    ap.add_argument("--out", default="/tmp/local_test.wav")
    ap.add_argument("--model-dir", default=os.environ.get("KOKORO_DIR", DEFAULT_DIR))
    ap.add_argument("--sid", type=int, default=3, help="0..99，3=zf_001 女声，55=zm_009 男声（近似）")
    ap.add_argument("--speed", type=float, default=0.9, help="0.9 即语速 -10%%")
    ap.add_argument("--all", action="store_true", help="按 narration/*.json 全量合成到 audio-local/")
    args = ap.parse_args()

    tts = build_tts(args.model_dir, args.sid)
    print(f"音色数 {tts.num_speakers}，采样率 {tts.sample_rate}")
    if args.text:
        dur, dt = gen_wav(tts, args.text, args.sid, args.speed, args.out)
        print(f"✅ {args.out} 音频{dur:.1f}s / 耗时{dt:.1f}s → RTF {dt/dur:.2f}")
        return
    if args.all:
        out_dir = pathlib.Path("audio-local"); out_dir.mkdir(exist_ok=True)
        for f in sorted(pathlib.Path("narration").glob("kp-*.json")):
            nn = f.stem.split("-")[1]
            data = json.loads(f.read_text(encoding="utf-8"))
            mf = {"v": 1, "voice": f"kokoro-zh-sid{args.sid}", "rate": f"-{int((1-args.speed)*100)}%", "segs": []}
            for i, text in enumerate(data["segs"], 1):
                wav = out_dir / f"kp-{nn}-{i}.wav"
                mp3 = out_dir / f"kp-{nn}-{i}.mp3"
                dur, dt = gen_wav(tts, text, args.sid, args.speed, str(wav))
                r = subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(wav),
                                    "-codec:a", "libmp3lame", "-b:a", "24k", "-ac", "1", str(mp3)],
                                   capture_output=True)
                wav.unlink()
                if r.returncode != 0:
                    print(f"❌ kp-{nn}-{i} ffmpeg 失败"); continue
                mf["segs"].append({"a": mp3.name, "s": f"kp-{nn}-{i}.srt", "text": text})
                print(f"kp-{nn}-{i}: {dur:.0f}s 音频 RTF {dt/dur:.2f}")
            (out_dir / f"kp-{nn}.json").write_text(json.dumps(mf, ensure_ascii=False), encoding="utf-8")
        total = sum(x.stat().st_size for x in out_dir.glob("*.mp3"))
        print(f"完成，audio-local 总量 {total/1024/1024:.1f} MB")
if __name__ == "__main__":
    main()
