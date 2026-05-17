FROM ghcr.io/home-assistant/aarch64-base:3.20

RUN apk add --no-cache python3 py3-pip bash

WORKDIR /app

COPY requirements.txt .

RUN pip3 install --break-system-packages -r requirements.txt

COPY . .

RUN chmod +x /app/run.sh

CMD ["/app/run.sh"]