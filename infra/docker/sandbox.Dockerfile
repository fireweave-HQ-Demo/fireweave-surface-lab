FROM python:3.12-slim
WORKDIR /app
COPY apps/sandbox-ehr/server.py /ehr.py
COPY apps/sandbox-payer/server.py /payer.py
CMD ["python", "/ehr.py"]
