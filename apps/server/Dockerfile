# Build the bundle first:  pnpm --filter @alexioncity/server build
# Then, from the repo root: docker build -f apps/server/Dockerfile -t alexioncity-server .
FROM node:22-alpine
WORKDIR /app
COPY apps/server/dist/index.js ./server.mjs
ENV NODE_ENV=production PORT=8787
EXPOSE 8787
USER node
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:8787/healthz || exit 1
CMD ["node", "server.mjs"]
