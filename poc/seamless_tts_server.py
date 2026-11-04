#!/usr/bin/env python3
"""Local Meta TTS voice upgrade: facebook/seamless-m4t-v2-large over loopback HTTP.

Same contract as mms_tts_server.py: POST /speak {"text": "..."} -> mono
16-bit WAV bytes, GET /health -> {"ok": true, ...}. Runs text-to-speech
English->English through Seamless v2 (UnitY2 + vocoder), which carries
far more natural prosody than the single-speaker MMS VITS voice.

CPU-friendly enough for a demo (~1-3 s per short coach line); requests
are serialized so concurrent generations never thrash the BLAS pool.

    poc/.venv/bin/python poc/seamless_tts_server.py --port 8766
"""
import argparse
import io
import json
import os
import threading
import time
import wave
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

# Model weights live with the POC (overridable via HF_HOME), never in /tmp.
os.environ.setdefault(
    "HF_HOME", os.path.join(os.path.dirname(os.path.abspath(__file__)), ".hf-cache")
)

import numpy as np
import torch
from transformers import SeamlessM4TProcessor, SeamlessM4Tv2ForTextToSpeech

MODEL_ID = "facebook/seamless-m4t-v2-large"
SRC_LANG = "eng"
TGT_LANG = "eng"


def default_tempo() -> float:
    try:
        return min(1.1, max(0.75, float(os.environ.get("TTS_TEMPO", "0.9"))))
    except ValueError:
        return 0.9


def wsola_stretch(x: np.ndarray, rate: int, tempo: float) -> np.ndarray:
    """Slow speech without the pitch drop (waveform-similarity overlap-add).

    tempo < 1 stretches (0.9 ≈ 11% longer); tempo >= 1 returns x untouched.
    Pitch and formants survive; only time moves.
    """
    if tempo >= 1.0 or len(x) < rate:
        return x
    hop_s = rate // 100  # 10 ms synthesis hop
    hop_a = max(1, int(round(hop_s * tempo)))
    win = rate * 20 // 1000  # 20 ms frames
    tol = rate * 10 // 1000  # ±10 ms similarity search
    window = np.hanning(win)
    out = np.zeros(win + int(len(x) / tempo) + hop_s, dtype=np.float64)
    pos = 0  # synthesis frame start in out
    ana = 0  # expected analysis start in x
    filled = 0
    xd = x.astype(np.float64)
    while ana + win <= len(xd):
        lo = max(0, ana - tol)
        hi = min(len(xd) - win, ana + tol)
        if hi <= lo:
            best = ana
        else:
            ref = out[pos : pos + win] if filled >= pos + win else xd[ana : ana + win]
            # Offset with the best overlap to what we already emitted.
            scores = [
                float(np.dot(xd[o : o + win] * window, ref * window))
                for o in range(lo, hi + 1, 8)
            ]
            best = lo + 8 * int(np.argmax(scores))
        frame = xd[best : best + win] * window
        out[pos : pos + win] += frame  # Hann at 50% overlap sums flat
        filled = max(filled, pos + win)
        pos += hop_s
        ana += hop_a
    return out[:filled].astype(np.float32)


def gentle_eq(x: np.ndarray, rate: int) -> np.ndarray:
    """Warm tilt: soft lows, tamed harshness, rolled-off fizz. Zero-phase."""
    n = len(x)
    if n < 64:
        return x
    freqs = np.fft.rfftfreq(n, 1.0 / rate)
    gain_db = np.zeros_like(freqs)
    gain_db += 2.5 * np.exp(-0.5 * ((freqs - 180) / 160) ** 2)  # warmth
    gain_db -= 2.0 * np.exp(-0.5 * ((freqs - 3200) / 1200) ** 2)  # harshness dip
    gain_db -= 4.0 / (1.0 + np.exp(-(freqs - 6800.0) / 400.0))  # top-octave fizz
    curve = 10.0 ** (np.clip(gain_db, -12.0, 6.0) / 20.0)
    curve[0] = 0.0  # no DC
    y = np.fft.irfft(np.fft.rfft(x.astype(np.float64)) * curve, n=n)
    return y.astype(np.float32)


def soften_edges(x: np.ndarray, rate: int) -> np.ndarray:
    """20 ms raised-cosine fades: no clicks, softer attacks."""
    n = min(len(x) // 4, rate * 20 // 1000)
    if n < 8:
        return x
    ramp = 0.5 - 0.5 * np.cos(np.linspace(0.0, np.pi, n, dtype=np.float64))
    y = x.astype(np.float64)
    y[:n] *= ramp
    y[-n:] *= ramp[::-1]
    return y.astype(np.float32)


class TTS:
    def __init__(self) -> None:
        print(f"[tts] loading {MODEL_ID} on cpu ...", flush=True)
        started = time.time()
        # Explicit class: AutoProcessor misresolves the v2 tokenizer to a
        # tiktoken BPE reader, but tokenizer.model is SentencePiece.
        self.processor = SeamlessM4TProcessor.from_pretrained(MODEL_ID)
        self.model = SeamlessM4Tv2ForTextToSpeech.from_pretrained(MODEL_ID)
        # Dynamic int8: the standard CPU lever for big transformers (~2-3x
        # here); Linear-only so the convolutional vocoder is untouched.
        # ARM macOS builds need the engine pinned (fbgemm is x86-only).
        torch.backends.quantized.engine = "qnnpack"
        self.model = torch.quantization.quantize_dynamic(
            self.model, {torch.nn.Linear}, dtype=torch.qint8
        )
        self.model.eval()
        # Coach lines repeat across runs; identical text replays instantly.
        self.cache: dict[str, bytes] = {}
        self.cache_order: list[str] = []
        self.rate = int(self.model.config.sampling_rate)
        self.lock = threading.Lock()
        print(
            f"[tts] ready ({self.rate} Hz, cpu, loaded in {time.time() - started:.0f}s)",
            flush=True,
        )

    def speak(self, text: str, tempo: float) -> bytes:
        text = " ".join(text.split())[:500]
        key = f"{tempo:.3f}|{text}"
        if (hit := self.cache.get(key)) is not None:
            return hit
        inputs = self.processor(text=text, src_lang=SRC_LANG, return_tensors="pt")
        with self.lock, torch.no_grad():
            # Greedy units: the default 5-beam search costs ~5x on CPU for
            # little audible gain on short coach lines.
            wav = self.model.generate(**inputs, tgt_lang=TGT_LANG, num_beams=1)[0].cpu()
        # Flatten: generate keeps a leading batch dim ([1, 1, T]); tobytes()
        # used to hide that, but the DSP chain needs a true 1-D signal —
        # without this, len() reads the batch dim and the stretch no-ops.
        audio = wav.clamp(-1, 1).reshape(-1).numpy().astype(np.float32)
        # Voice preset: unhurried tempo, warm and smooth, soft edges.
        audio = wsola_stretch(audio, self.rate, tempo)
        audio = gentle_eq(audio, self.rate)
        audio = soften_edges(audio, self.rate)
        peak = float(np.max(np.abs(audio))) or 1.0
        pcm = (audio / peak * 0.89 * 32767).astype(np.int16).tobytes()
        buf = io.BytesIO()
        with wave.open(buf, "wb") as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(self.rate)
            w.writeframes(pcm)
        out = buf.getvalue()
        self.cache[key] = out
        self.cache_order.append(key)
        if len(self.cache_order) > 50:  # bounded: ~50 short clips in RAM
            self.cache.pop(self.cache_order.pop(0), None)
        return out


tts: TTS | None = None


class Handler(BaseHTTPRequestHandler):
    server_version = "seamless-tts/1"

    def log_message(self, *args):  # keep stdout for lifecycle lines
        pass

    def _send(self, code: int, body: bytes, ctype: str) -> None:
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):  # noqa: N802
        if self.path == "/health":
            assert tts is not None
            payload = json.dumps(
                {
                    "ok": True,
                    "model": MODEL_ID,
                    "device": "cpu",
                    "rate": tts.rate,
                    "tempo": default_tempo(),
                }
            ).encode()
            self._send(200, payload, "application/json")
        else:
            self._send(404, b"nope", "text/plain")

    def do_POST(self):  # noqa: N802
        if self.path != "/speak":
            self._send(404, b"nope", "text/plain")
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            data = json.loads(self.rfile.read(length) or b"{}")
            text = str(data.get("text", ""))
            if not text.strip():
                self._send(400, b"empty text", "text/plain")
                return
            try:
                tempo = float(data.get("tempo", default_tempo()))
            except (TypeError, ValueError):
                tempo = default_tempo()
            tempo = min(1.1, max(0.75, tempo))
            assert tts is not None
            started = time.time()
            audio = tts.speak(text, tempo)
            print(
                f"[tts] {len(text)} chars @{tempo:.2f} -> {len(audio)} bytes"
                f" in {time.time() - started:.1f}s",
                flush=True,
            )
            self._send(200, audio, "audio/wav")
        except Exception as err:  # never leak a stack to the client
            self._send(500, f"tts failed: {err}".encode()[:300], "text/plain")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8766)
    args = parser.parse_args()
    global tts
    tts = TTS()
    server = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    print(f"[tts] serving on http://127.0.0.1:{args.port}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
