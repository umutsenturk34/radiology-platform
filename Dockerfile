# Backend container for the Railway pilot (TASK_QUEUE DEVOPS-001).
#
# Single stage on purpose: @node-rs/argon2 and the Prisma query engine are
# native, and building them in the image that runs them removes a whole class
# of platform-mismatch failures. A larger image is the right trade for a pilot.
FROM node:22-bookworm-slim

# openssl is required by the Prisma query engine.
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# corepack cannot run pnpm on some Node 22 builds
# (ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING), so pnpm is installed directly.
RUN npm install -g pnpm@10.34.5

WORKDIR /app

# Manifests first, so a source-only change does not reinstall dependencies.
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json .npmrc tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/backend/package.json apps/backend/

# --ignore-scripts: the backend postinstall runs `prisma generate`, which needs
# a schema that has not been copied yet. It is run explicitly below.
RUN pnpm install --frozen-lockfile --ignore-scripts

COPY packages/shared packages/shared
COPY apps/backend apps/backend

RUN pnpm --filter @radiology/shared build \
    && pnpm --filter backend exec prisma generate \
    && pnpm --filter backend build

WORKDIR /app/apps/backend

# Dictation audio for the local storage driver. Ephemeral: it does not survive
# a redeploy, which is why DEVOPS-004 (a real bucket) is still open.
RUN mkdir -p .storage

ENV NODE_ENV=production

# Railway injects PORT; the app also defaults to 3001.
EXPOSE 3001

# Migrations run before the server accepts traffic. `migrate deploy` only
# applies pending migrations — it never resets or drops anything.
CMD ["sh", "-c", "pnpm exec prisma migrate deploy && node dist/main.js"]
