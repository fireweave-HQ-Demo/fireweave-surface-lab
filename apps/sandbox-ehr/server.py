import html
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs

PORT = 4010
DAY = "2026-10-24"
MORNING = ["08:00", "09:00", "10:00"]
END_OF_DAY = ["15:00", "16:00"]
CHART = {"patientName": "", "dob": "", "provider": "", "slot": ""}
NOTE = ""
APPOINTMENTS: list[dict] = []

TEMPLATE = """<!doctype html>
<html><body>
<form method="post" action="/chart">
  <label>Name <input id="patientName" name="patientName" value="{patientName}"></label>
  <label>DOB <input id="dob" name="dob" value="{dob}"></label>
  <label>Provider <input id="provider" name="provider" value="{provider}"></label>
  <label>Time of day <input id="timeOfDay" name="timeOfDay" value="{timeOfDay}"></label>
  <label>Slot <input id="slot" name="slot" value="{slot}"></label>
  <button id="save" type="submit">Save</button>
</form>
<p id="saved">{patientName} {dob}</p>
<p id="saved-state">{state}</p>
<p id="slot-label">{provider} {slot}</p>
<p id="booked-state">{booked}</p>
<form method="post" action="/note">
  <label>Note <textarea id="note" name="note">{note}</textarea></label>
  <button id="save-note" type="submit">Save note</button>
</form>
<pre id="note-text">{note}</pre>
<p id="note-state">{noteState}</p>
</body></html>
"""


def book(provider: str, time_of_day: str, slot: str, patient: str, dob: str) -> bool:
    allowed = END_OF_DAY if time_of_day == "end_of_day" else MORNING
    if slot not in allowed:
        return False
    if any(item["provider"] == provider and item["slot"] == slot for item in APPOINTMENTS):
        return False
    APPOINTMENTS.append(
        {"patientName": patient, "dob": dob, "provider": provider, "timeOfDay": time_of_day, "day": DAY, "slot": slot}
    )
    return True


def render(booked: str, time_of_day: str) -> bytes:
    values = {
        "patientName": CHART["patientName"],
        "dob": CHART["dob"],
        "provider": CHART["provider"],
        "slot": CHART["slot"],
        "timeOfDay": time_of_day,
        "state": "saved" if CHART["patientName"] else "empty",
        "booked": booked,
        "note": NOTE,
        "noteState": "saved" if NOTE else "empty",
    }
    page = TEMPLATE
    for key, value in values.items():
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
        if self.path == "/health":
            self._send(200, b"ok", "text/plain")
            return
        if self.path == "/schedule":
            self._send(200, json.dumps(APPOINTMENTS).encode(), "application/json")
            return
        self._send(200, render("booked" if CHART["slot"] else "empty", ""), "text/html")

    def do_POST(self) -> None:
        length = int(self.headers.get("content-length", "0"))
        form = parse_qs(self.rfile.read(length).decode())
        if self.path == "/note":
            global NOTE
            NOTE = form.get("note", [""])[0]
            self._send(200, render("booked" if CHART["slot"] else "empty", ""), "text/html")
            return
        CHART["patientName"] = form.get("patientName", [""])[0]
        CHART["dob"] = form.get("dob", [""])[0]
        CHART["provider"] = form.get("provider", [""])[0]
        CHART["slot"] = form.get("slot", [""])[0]
        booked = "booked" if book(CHART["provider"], form.get("timeOfDay", [""])[0], CHART["slot"], CHART["patientName"], CHART["dob"]) else "full"
        if booked != "booked":
            CHART["slot"] = ""
        self._send(200, render(booked, form.get("timeOfDay", [""])[0]), "text/html")

    def log_message(self, fmt: str, *args) -> None:
        return


if __name__ == "__main__":
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
