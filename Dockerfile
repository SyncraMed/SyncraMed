FROM node:20-alpine AS build

WORKDIR /app

COPY SyncraMed/SyncraMed.zip .

RUN unzip SyncraMed.zip

RUN npm i

RUN npm run build

FROM nginx:alpine

COPY --from=build /app/build /usr/share/nginx/html

COPY nginx.conf /etc/nginx/nginx.conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
