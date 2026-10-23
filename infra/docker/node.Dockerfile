FROM node:22-bookworm-slim
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
COPY . .
RUN pnpm --filter @clinic/console build && pnpm --filter @clinic/marketing build
CMD ["pnpm", "--filter", "@clinic/api", "exec", "tsx", "src/server.ts"]
