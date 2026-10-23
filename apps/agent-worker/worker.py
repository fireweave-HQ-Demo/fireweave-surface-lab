import asyncio
import json
import os
import urllib.request

from temporalio import activity
from temporalio.client import Client
from temporalio.worker import Worker

from extract_pdf import parse_pdf_base64

RUNNER = os.environ.get("BROWSER_RUNNER_URL", "http://browser-runner:4020")
DISCLOSURE = "This call is automated and recorded."


@activity.defn(name="extract")
async def extract(payload: dict) -> dict:
    return parse_pdf_base64(payload)


@activity.defn(name="placeCall")
async def place_call(payload: dict) -> dict:
    phone = str(payload.get("phone") or "")
    attempt = int(payload["attempt"])
    result = "no_answer" if phone.endswith("0000") and attempt == 1 else "answered"
    return {"result": result, "disclosure": DISCLOSURE, "questions": payload.get("questions") or []}


@activity.defn(name="fillChart")
async def fill_chart(payload: dict) -> dict:
    request = urllib.request.Request(
        f"{RUNNER}/sessions",
        data=json.dumps(payload).encode(),
        headers={"content-type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        return json.load(response)


async def main() -> None:
    address = os.environ.get("TEMPORAL_ADDRESS", "localhost:7233")
    last_error = None
    for _ in range(40):
        try:
            client = await Client.connect(address)
            worker = Worker(client, task_queue="agent-py", activities=[extract, fill_chart, place_call])
            await worker.run()
            return
        except Exception as error:
            last_error = error
            await asyncio.sleep(2)
    raise RuntimeError(f"temporal unavailable: {last_error}")


if __name__ == "__main__":
    asyncio.run(main())
