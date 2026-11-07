# Ferri: one image for the agent service, Desk (production build) and the setup/CLI tasks.
# The workspace ships TypeScript sources run with tsx, so the image keeps the whole workspace.
#
#   docker build -t ferri .
#
# compose.yml runs it three ways: `ferri` (the agent), `desk` (next start) and `ferri-cli`
# (one-shot commands: setup, doctor, connect, kb ...).

FROM node:22-bookworm-slim AS deps
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true
RUN corepack enable
WORKDIR /app
# Manifests first, so the dependency layer is cached until a package.json or the lockfile changes.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/ferri/package.json apps/ferri/
COPY apps/desk/package.json apps/desk/
COPY packages/db/package.json packages/db/
COPY packages/email/package.json packages/email/
COPY packages/knowledge/package.json packages/knowledge/
COPY packages/push/package.json packages/push/
COPY packages/shield/package.json packages/shield/
COPY packages/social/package.json packages/social/
COPY packages/switch/package.json packages/switch/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
# Desk's production build. Allowed extra origins for Pocket's forms are baked in here
# (POCKET_ALLOWED_ORIGINS); same-origin requests always work.
ARG POCKET_ALLOWED_ORIGINS=*.trycloudflare.com
ENV NEXT_TELEMETRY_DISABLED=1 POCKET_ALLOWED_ORIGINS=${POCKET_ALLOWED_ORIGINS}
RUN pnpm --filter @ferri/desk build

FROM node:22-bookworm-slim AS runtime
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
RUN corepack enable && corepack prepare pnpm@10.11.0 --activate \
 && apt-get update && apt-get install -y --no-install-recommends ca-certificates tini \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /app /app
# The root .env is bind-mounted here by compose.yml; scripts load it with --env-file-if-exists.
LABEL org.opencontainers.image.source="https://github.com/RudraO2/Ferri" \
      org.opencontainers.image.description="Ferri, the AI teammate for community event organizers, built on Switch" \
      org.opencontainers.image.licenses="MIT"
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["pnpm", "start"]
