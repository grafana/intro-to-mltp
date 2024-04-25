# Multistage build - allows for smaller final images post Python build
FROM node:20-alpine3.19 as builder
ARG SERVICE

WORKDIR /usr/src/app

# Install Python3 - Needed for the pprof NPM module
ENV PYTHONUNBUFFERED=1
RUN apk add --update --no-cache python3 alpine-sdk && ln -sf python3 /usr/bin/python
## && \
##    python3 -m ensurepip
#     && \
#    pip3 install --no-cache --upgrade pip setuptools

COPY ${SERVICE}/package.json /usr/src/app/

RUN apk update && apk upgrade && \
    apk add --no-cache bash git openssh

RUN npm install --production \
    && npm cache clean --force \
    && rm -rf /tmp/*

# Create a slimmer image using the built node_modules
FROM node:17-alpine3.14
ARG SERVICE

WORKDIR /usr/src/app

COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/package* ./

COPY ${SERVICE}/*.js /usr/src/app/
COPY common/*.js /usr/src/app/

CMD ["npm", "start"]
