FROM python:3.12-slim
WORKDIR /app
RUN pip install --no-cache-dir "temporalio==1.11.1" "pypdf==5.9.0"
COPY apps/agent-worker /app
COPY fixtures /fixtures
CMD ["python", "worker.py"]
