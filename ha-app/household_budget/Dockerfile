FROM node:22-alpine

WORKDIR /app

COPY app/package*.json ./
RUN npm ci --omit=dev

COPY app/ ./

COPY run.sh /run.sh
RUN chmod a+x /run.sh

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
ENV DATABASE_PATH=/data/budget.sqlite
ENV APP_SETTINGS_PATH=/data/app-settings.json
ENV APP_THEME=system

CMD ["/run.sh"]
