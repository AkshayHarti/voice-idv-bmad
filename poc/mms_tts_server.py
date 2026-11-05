#!/usr/bin/env python3
"""Local Meta TTS for the voice POC: facebook/mms-tts-eng over loopback HTTP.

Loads once, serves many: POST /speak {"text": "..."} -> 16 kHz mono
16-bit WAV bytes. GET /health -> {"ok": true}. The orchestrator spawns
this automatically; run it standalone for testing:

    poc/.venv/bin/python poc/mms_tts_server.py --port 8765
"""
import argparse
import io
import json
import os
import wave
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

# Model weights live with the POC (overridable via HF_HOME), never in /tmp.
os.environ.setdefault(
    "HF_HOME", os.path.join(os.path.dirname(os.path.abspath(__file__)), ".hf-cache")
)

import torch
from transformers import AutoTokenizer, VitsModel

MODEL_ID = "facebook/mms-tts-eng"


def pick_device() -> str:
    if torch.backends.mps.is_available():
        try:
            torch.zeros(1, device="mps")
            return "mps"
        except Exception:
            pass
    return "cpu"


class TTS:
    def __init__(self) -> None:
        self.device = pick_device()
        print(f"[tts] loading {MODEL_ID} on {self.device} ...", flush=True)
        self.tokenizer = AutoTokenizer.from_pretrained(MODEL_ID)
        self.model = VitsModel.from_pretrained(MODEL_ID).to(self.device)
        self.model.eval()
        self.rate = int(self.model.config.sampling_rate)
        print(f"[tts] ready ({self.rate} Hz, {self.device})", flush=True)

    def speak(self, text: str) -> bytes:
        text = " ".join(text.split())[:500]
        inputs = self.tokenizer(text, return_tensors="pt")
        inputs = {k: v.to(self.device) for k, v in inputs.items()}
        with torch.no_grad():
            wav = self.model(**inputs).waveform[0].cpu()
        pcm = (wav.clamp(-1, 1) * 32767).to(torch.int16).numpy().tobytes()
        buf = io.BytesIO()
        with wave.open(buf, "wb") as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(self.rate)
            w.writeframes(pcm)
        return buf.getvalue()


tts: TTS | None = None


class Handler(BaseHTTPRequestHandler):
    server_version = "mms-tts/1"

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
                {"ok": True, "model": MODEL_ID, "device": tts.device, "rate": tts.rate}
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
            assert tts is not None
            self._send(200, tts.speak(text), "audio/wav")
        except Exception as err:  # never leak a stack to the client
            self._send(500, f"tts failed: {err}".encode()[:300], "text/plain")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()
    global tts
    tts = TTS()
    server = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    print(f"[tts] serving on http://127.0.0.1:{args.port}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
