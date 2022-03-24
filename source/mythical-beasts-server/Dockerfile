FROM node:17-alpine3.14

WORKDIR /usr/src/app

COPY package.json /usr/src/app/

RUN apk update && apk upgrade && \
    apk add --no-cache bash git openssh

RUN npm install --production \
    && npm cache clean --force \
    && rm -rf /tmp/*

COPY *.js /usr/src/app/

CMD ["npm", "start"]
