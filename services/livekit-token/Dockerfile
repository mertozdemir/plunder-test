# Build from the repo root: docker build -f services/livekit-token/Dockerfile .
FROM node:22-slim
RUN corepack enable
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY services/livekit-token/package.json services/livekit-token/
RUN pnpm install --filter @plunder/livekit-token --prod --frozen-lockfile
COPY services/livekit-token/src services/livekit-token/src
WORKDIR /app/services/livekit-token
ENV NODE_ENV=production
CMD ["node", "--experimental-strip-types", "src/main.ts"]
