FROM golang:1.24-alpine AS build

ENV HUGO_VERSION=0.157.0

RUN apk add --no-cache curl git nodejs npm libc6-compat libstdc++ && \
    curl -L https://github.com/gohugoio/hugo/releases/download/v${HUGO_VERSION}/hugo_extended_${HUGO_VERSION}_linux-amd64.tar.gz | \
    tar -xz -C /usr/local/bin hugo

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .
RUN hugo --minify

FROM alpine:3.21
RUN apk add --no-cache darkhttpd
COPY --from=build /app/public /var/www
EXPOSE 8080
CMD ["darkhttpd", "/var/www", "--port", "8080"]
