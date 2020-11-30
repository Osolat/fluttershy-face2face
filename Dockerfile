FROM node:current-slim

WORKDIR /usr/src/app
RUN apt-get update || : && apt-get install -y nodejs
RUN apt-get install sudo -y
RUN npm install
COPY main/database.json .
ADD main main/
EXPOSE 80
CMD [ "sudo", "node", "main/app.js"]

