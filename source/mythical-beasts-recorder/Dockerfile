FROM node:17-alpine3.14
ARG SERVICE

WORKDIR /usr/src/app

COPY ${SERVICE}/package.json /usr/src/app/

RUN npm install --production \
    && npm cache clean --force \
    && rm -rf /tmp/*

COPY ${SERVICE}/*.js /usr/src/app/

CMD ["npm", "start"]
