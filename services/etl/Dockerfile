FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DAGSTER_HOME=/opt/dagster/dagster_home

WORKDIR /opt/dagster/app

COPY services/etl/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY services/etl/etl_project ./etl_project
COPY services/etl/sample_data /opt/dagster/sample_data

RUN mkdir -p "$DAGSTER_HOME"

EXPOSE 3000

CMD ["dagster", "dev", "--module-name", "etl_project.definitions", "--host", "0.0.0.0", "--port", "3000"]
