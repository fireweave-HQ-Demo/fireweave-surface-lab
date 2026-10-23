import base64
import hashlib
import hmac
import json
import os
import time
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from playwright.sync_api import sync_playwright

SECRET = os.environ.get("CLINIC_DATA_KEY", "dev-only-data-key")
API = os.environ.get("API_URL", "http://api:4000")
TOKEN = os.environ.get("INTERNAL_TOKEN", "dev-internal-token")
PORT = int(os.environ.get("PORT", "4020"))
FRAMES: dict[str, bytes] = {}
HELD: set[str] = set()


def b64url(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def verify(token: str) -> bool:
    body, _, sig = token.partition(".")
    if not body or not sig:
        return False
    expected = b64url(hmac.new(SECRET.encode(), body.encode(), hashlib.sha256).digest())
    if not hmac.compare_digest(expected, sig):
        return False
    padding = "=" * (-len(body) % 4)
    payload = json.loads(base64.urlsafe_b64decode(body + padding))
    return payload["exp"] > time.time() * 1000


def consume(token: str) -> bool:
    request = urllib.request.Request(
        f"{API}/internal/tokens/consume",
        data=json.dumps({"token": token}).encode(),
        headers={"content-type": "application/json", "x-internal-token": TOKEN},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            return json.load(response).get("ok") is True
    except Exception:
        return False


def browser():
    playwright = sync_playwright().start()
    chrome = playwright.chromium.launch(headless=True, args=["--no-sandbox", "--disable-dev-shm-usage"])
    return playwright, chrome


def fill(session_id: str, sandbox_url: str, fields: dict) -> None:
    playwright, chrome = browser()
    try:
        page = chrome.new_page()
        page.goto(sandbox_url.rstrip("/") + "/chart")
        page.fill("#patientName", fields["patientName"])
        page.fill("#dob", fields["dob"])
        page.fill("#provider", fields["provider"])
        page.fill("#timeOfDay", fields["timeOfDay"])
        page.fill("#slot", fields["slot"])
        page.click("#save")
        page.locator("#booked-state", has_text="booked").wait_for()
        FRAMES[session_id] = page.screenshot()
    finally:
        chrome.close()
        playwright.stop()


def fill_auth(session_id: str, sandbox_url: str, fields: dict) -> str:
    playwright, chrome = browser()
    try:
        page = chrome.new_page()
        page.goto(sandbox_url.rstrip("/") + "/")
        page.fill("#cpt", fields["cpt"])
        page.fill("#diagnosis", fields["diagnosis"])
        page.fill("#serviceDate", fields["serviceDate"])
        page.click("#submit-auth")
        page.locator("#auth-number").wait_for()
        FRAMES[session_id] = page.screenshot()
        return page.locator("#auth-number").inner_text().strip()
    finally:
        chrome.close()
        playwright.stop()


def fill_note(session_id: str, sandbox_url: str, note: str) -> None:
    playwright, chrome = browser()
    try:
        page = chrome.new_page()
        page.goto(sandbox_url.rstrip("/") + "/chart")
        page.fill("#note", note)
        page.click("#save-note")
        page.locator("#note-state", has_text="saved").wait_for()
        FRAMES[session_id] = page.screenshot()
    finally:
        chrome.close()
        playwright.stop()


class Handler(BaseHTTPRequestHandler):
    def _json(self, code: int, payload: dict) -> None:
        raw = json.dumps(payload).encode()
        self.send_response(code)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def _read(self) -> dict:
        length = int(self.headers.get("content-length", "0"))
        if length == 0:
            return {}
        return json.loads(self.rfile.read(length))

    def do_GET(self) -> None:
        if self.path == "/health":
            self._json(200, {"ok": True})
            return
        if self.path.startswith("/sessions/") and self.path.endswith("/frame"):
            session_id = self.path.split("/")[2]
            frame = FRAMES.get(session_id)
            if not frame:
                self.send_response(404)
                self.end_headers()
                return
            self.send_response(200)
            self.send_header("content-type", "image/png")
            self.send_header("content-length", str(len(frame)))
            self.end_headers()
            self.wfile.write(frame)
            return
        self._json(404, {"error": "missing"})

    def do_POST(self) -> None:
        if self.path == "/sessions":
            payload = self._read()
            session_id = payload["sessionId"]
            if session_id in HELD:
                self._json(200, {"ok": False, "error": "paused"})
                return
            token = payload.get("approvalToken") or ""
            if not verify(token) or not consume(token):
                self._json(403, {"ok": False, "error": "token"})
                return
            fill(session_id, payload["sandboxUrl"], payload["fields"])
            self._json(200, {"ok": True})
            return
        if self.path == "/authorizations":
            payload = self._read()
            token = payload.get("approvalToken") or ""
            if not verify(token) or not consume(token):
                self._json(403, {"ok": False, "error": "token"})
                return
            number = fill_auth(payload["sessionId"], payload["sandboxUrl"], payload["fields"])
            self._json(200, {"ok": bool(number), "authNumber": number})
            return
        if self.path == "/notes":
            payload = self._read()
            token = payload.get("approvalToken") or ""
            if not verify(token) or not consume(token):
                self._json(403, {"ok": False, "error": "token"})
                return
            fill_note(payload["sessionId"], payload["sandboxUrl"], payload["note"])
            self._json(200, {"ok": True})
            return
        if self.path.endswith("/handoff"):
            session_id = self.path.split("/")[2]
            if self._read().get("held"):
                HELD.add(session_id)
            else:
                HELD.discard(session_id)
            self._json(200, {"ok": True})
            return
        self._json(404, {"error": "missing"})

    def log_message(self, fmt: str, *args) -> None:
        print(args)


if __name__ == "__main__":
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
