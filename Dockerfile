FROM golang:alpine

ENV HUGO_VERSION 0.157.0

WORKDIR /tmp
RUN apk update && apk upgrade && apk add --no-cache curl tar git nodejs npm && \
    curl -L https://github.com/gohugoio/hugo/releases/download/v${HUGO_VERSION}/hugo_extended_${HUGO_VERSION}_linux-amd64.tar.gz > \
    hugo.tar.gz && \
    tar -zxvf hugo.tar.gz && \
    mv ./hugo /bin/hugo && \
    rm -rf /tmp

WORKDIR /app

ADD . /app

RUN npm ci && hugo
