# BrightRule 明规 on ObjectOS Enterprise Edition.
#
# One layer on top of the official EE image. It adds this app's artifact, the
# app's production dependencies (in their own node_modules, the EE image's are
# left alone), the 制度问询 plugins compiled from src/qa, and an entry config
# that is the stock EE config plus those plugins.
#
# Why the extra layer: an artifact boot mounts the app's metadata and hook
# functions but not its code plugins, and the EE image does not carry
# @objectstack/service-knowledge, @objectstack/embedder-openai or pg
# (objectstack-ai/objectstack#36647). Drop this layer once that is fixed.
#
# Build with ./build.sh from anywhere (it builds dist/ and the plugins first).
# Build context: the repository root.

ARG OS_EE_IMAGE=ghcr.io/objectstack-ai/objectos-ee:18.6.0
FROM ${OS_EE_IMAGE}

USER root
WORKDIR /srv/brightrule

# 1) Production dependencies: @objectstack/service-knowledge,
#    @objectstack/embedder-openai, pg, … resolved from this directory only.
#    Optional: on a build host behind a TLS-intercepting proxy, pass its CA
#    with `--secret id=ca,src=<ca file>`; without it the mount is skipped.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=secret,id=ca,required=false sh -c \
    '[ -f /run/secrets/ca ] && export NODE_EXTRA_CA_CERTS=/run/secrets/ca; \
     corepack pnpm@10 install --prod --frozen-lockfile --ignore-scripts'

# 2) The app artifact and the compiled 制度问询 plugins (src/qa).
COPY dist/ ./dist/
COPY deploy/objectos-ee/.build/qa/ ./qa/
RUN chown -R nodejs /srv/brightrule

# 3) Entry config: the stock EE config, renamed and unchanged, plus the plugins.
WORKDIR /repo/cloud/apps/objectos-ee
RUN mv objectstack.config.ts ee-base.config.ts
COPY deploy/objectos-ee/ee-host.config.ts ./objectstack.config.ts

USER nodejs
# The app arrives as an artifact composed with the EE plugins (air-gap licence,
# no control plane): see deploy/objectos-ee/README.md.
ENV OS_COMPOSED_ARTIFACT_URL=file:///srv/brightrule/dist/objectstack.json \
    OS_CLOUD_URL=off
