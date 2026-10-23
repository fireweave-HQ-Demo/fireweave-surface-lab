FROM node:22-bookworm-slim AS build
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc turbo.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/console/package.json apps/console/package.json
COPY apps/marketing/package.json apps/marketing/package.json
COPY apps/extension/package.json apps/extension/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/domain/package.json packages/domain/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/ui/package.json packages/ui/package.json
RUN pnpm install --frozen-lockfile
COPY apps/api apps/api
COPY apps/console apps/console
COPY packages packages
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @clinic/console build \
  && pnpm --filter @clinic/api deploy --prod --legacy /out/api

FROM node:22-bookworm-slim
WORKDIR /app
COPY --from=build /out/api /app
COPY --from=build /app/packages/db/migrations /packages/db/migrations
COPY --from=build /app/apps/console/.next/standalone /console
COPY --from=build /app/apps/console/.next/static /console/apps/console/.next/static
CMD ["./node_modules/.bin/tsx", "src/server.ts"]
