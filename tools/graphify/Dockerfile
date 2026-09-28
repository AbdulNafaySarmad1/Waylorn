FROM python:3.12-slim

RUN pip install --no-cache-dir --root-user-action=ignore "graphifyy[sql]==0.9.64"

WORKDIR /repo
ENTRYPOINT ["graphify"]
