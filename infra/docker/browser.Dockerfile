FROM mcr.microsoft.com/playwright/python:v1.55.0-noble
WORKDIR /app
RUN pip install --no-cache-dir playwright==1.55.0
COPY apps/browser-runner/server.py /app/server.py
CMD ["python", "server.py"]
