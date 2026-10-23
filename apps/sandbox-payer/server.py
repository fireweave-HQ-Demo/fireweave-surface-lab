import html
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs

PORT = 4011
AUTHS: list[dict] = []
LAST = {"cpt": "", "diagnosis": "", "serviceDate": "", "missing": "", "authNumber": ""}

TEMPLATE = """<!doctype html>
<html><body>
<form method="post" action="/">
  <label>CPT <input id="cpt" name="cpt" value="{cpt}"></label>
  <label>Diagnosis <input id="diagnosis" name="diagnosis" value="{diagnosis}"></label>
  <label>Service date <input id="serviceDate" name="serviceDate" value="{serviceDate}"></label>
  <button id="submit-auth" type="submit">Submit Authorization Request</button>
</form>
<p id="missing">{missing}</p>
<p id="auth-number">{authNumber}</p>
</body></html>
"""


def render() -> bytes:
    page = TEMPLATE
    for key, value in LAST.items():
        page = page.replace("{" + key + "}", html.escape(value))
    return page.encode()


class Handler(BaseHTTPRequestHandler):
    def _send(self, code: int, body: bytes, content_type: str) -> None:
        self.send_response(code)
        self.send_header("content-type", content_type)
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        if self.path == "/auths":
            self._send(200, json.dumps(AUTHS).encode(), "application/json")
            return
        self._send(200, render(), "text/html")

    def do_POST(self) -> None:
        length = int(self.headers.get("content-length", "0"))
        form = parse_qs(self.rfile.read(length).decode())
        LAST["cpt"] = form.get("cpt", [""])[0].strip()
        LAST["diagnosis"] = form.get("diagnosis", [""])[0].strip()
        LAST["serviceDate"] = form.get("serviceDate", [""])[0].strip()
        missing = [name for name in ("cpt", "diagnosis", "serviceDate") if not LAST[name]]
        if missing:
            LAST["missing"] = ", ".join(missing)
            LAST["authNumber"] = ""
        else:
            LAST["missing"] = ""
            LAST["authNumber"] = f"AUTH-{1000 + len(AUTHS) + 1}"
            AUTHS.append(dict(LAST))
        self._send(200, render(), "text/html")

    def log_message(self, fmt: str, *args) -> None:
        return


if __name__ == "__main__":
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
