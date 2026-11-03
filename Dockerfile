# syntax=docker/dockerfile:1
# Same app as the Proxmox LXC installer (proxmox-install.sh). Keep both installs in step.

FROM node:22.23.4-alpine AS build
WORKDIR /src
RUN --mount=type=cache,target=/etc/apk/cache,sharing=locked \
    apk add libc6-compat
RUN --mount=type=bind,source=package.json,target=package.json \
    --mount=type=bind,source=package-lock.json,target=package-lock.json \
    --mount=type=secret,id=npmrc,target=/root/.npmrc,required=false \
    --mount=type=cache,target=/root/.npm \
    npm ci
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22.23.4-alpine AS dev
WORKDIR /src
RUN --mount=type=cache,target=/etc/apk/cache,sharing=locked \
    apk add libc6-compat
RUN --mount=type=bind,source=package.json,target=package.json \
    --mount=type=bind,source=package-lock.json,target=package-lock.json \
    --mount=type=secret,id=npmrc,target=/root/.npmrc,required=false \
    --mount=type=cache,target=/root/.npm \
    npm ci
COPY . .
ENV NODE_ENV=development \
    NEXT_TELEMETRY_DISABLED=1 \
    VOLTDESK_DATA_DIR=/data \
    PORT=3470 \
    HOSTNAME=0.0.0.0
EXPOSE 3470
CMD ["npm", "run", "dev", "--", "--port", "3470", "--hostname", "0.0.0.0"]

FROM node:22.23.4-alpine AS runtime
WORKDIR /app
RUN --mount=type=cache,target=/etc/apk/cache,sharing=locked \
    apk add libc6-compat
RUN addgroup --system --gid 1001 appgroup && \
    adduser --system --uid 1001 --ingroup appgroup appuser && \
    mkdir -p /data && \
    chown 1001:1001 /data

COPY --from=build --link --chown=1001:1001 /src/.next/standalone ./
COPY --from=build --link --chown=1001:1001 /src/.next/static ./.next/static
COPY --from=build --link --chown=1001:1001 /src/public ./public
COPY --from=build --link --chown=1001:1001 /src/scripts/voltdesk-user.mjs ./scripts/voltdesk-user.mjs
COPY --link --chmod=755 docker/entrypoint.sh /usr/local/bin/voltdesk-entrypoint
RUN chmod 755 /app/scripts/voltdesk-user.mjs && \
    ln -sf /app/scripts/voltdesk-user.mjs /usr/local/bin/voltdesk-user

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3470 \
    VOLTDESK_DATA_DIR=/data

USER appuser
EXPOSE 3470
VOLUME ["/data"]

LABEL org.opencontainers.image.source="https://github.com/nasagreir/voltdesk" \
      org.opencontainers.image.title="VoltDesk" \
      org.opencontainers.image.description="Self-hosted Tesla dashboard"

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||3470)+'/api/auth/me').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]

ENTRYPOINT ["/usr/local/bin/voltdesk-entrypoint"]
