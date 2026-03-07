FROM alpine:3.21

ENV HUGO_VERSION=0.157.0

RUN apk add --no-cache curl tar git nodejs npm libc6-compat libstdc++ && \
    curl -L https://github.com/gohugoio/hugo/releases/download/v${HUGO_VERSION}/hugo_extended_${HUGO_VERSION}_linux-amd64.tar.gz | \
    tar -xz -C /usr/local/bin hugo && \
    rm -rf /var/cache/apk/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --production

COPY . .

RUN hugo
