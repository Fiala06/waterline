# Waterline: one image, one volume (/data).
FROM node:22-bookworm-slim AS build
WORKDIR /app
# Build tools only in case better-sqlite3 has no prebuilt binary for this platform.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
	&& rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production \
	PORT=3000 \
	DATA_DIR=/data \
	BODY_SIZE_LIMIT=64M \
	MIGRATIONS_DIR=/app/drizzle
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/build ./build
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/scripts/hash-password.mjs ./scripts/
# Debian's security fixes since the base image was made; and no npm, npx or
# corepack, which the server never runs (fewer packages to carry advisories, #101).
RUN apt-get update && apt-get upgrade -y --no-install-recommends && rm -rf /var/lib/apt/lists/* \
	&& rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
		/usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack
# `hash-password` in the container console prints a LOCAL_ADMIN_PASSWORD_HASH value.
RUN printf '#!/bin/sh\nexec node /app/scripts/hash-password.mjs "$@"\n' > /usr/local/bin/hash-password \
	&& chmod +x /usr/local/bin/hash-password \
	&& mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
	CMD node -e "fetch('http://localhost:'+process.env.PORT+'/signin').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "build"]
