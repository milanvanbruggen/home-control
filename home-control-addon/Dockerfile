FROM node:24-alpine

# Home Assistant add-on metadata (Supervisor passes these build args).
ARG BUILD_ARCH
ARG BUILD_VERSION
LABEL \
  io.hass.type="addon" \
  io.hass.arch="${BUILD_ARCH}" \
  io.hass.version="${BUILD_VERSION}"

RUN apk add --no-cache git

WORKDIR /app

# Build the app by cloning the (public) repo. Bump REPO_REF to pin a tag/branch.
ARG REPO_URL=https://github.com/milanvanbruggen/home-control
ARG REPO_REF=main
RUN git clone --depth 1 --branch "${REPO_REF}" "${REPO_URL}" . \
 && npm ci \
 && npm run build \
 && npm prune --omit=dev \
 && npm cache clean --force

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

# `next start` binds 0.0.0.0:3000; the Supervisor maps it to host port 3009.
CMD ["npm", "start"]
