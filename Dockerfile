FROM node:24.22.1-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

# Etapa: development | testing | staging | production
# Build:  docker build --build-arg STAGE=production -t reservai-stripe-service .
# Runtime (sin rebuild): docker run -e STAGE=staging ...
ARG STAGE=development
ENV STAGE=${STAGE}

EXPOSE 3001

CMD node ./server.js 3001 $STAGE
