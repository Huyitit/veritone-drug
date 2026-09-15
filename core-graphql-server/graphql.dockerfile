ARG NODE_VERSION=20.19.5
ARG CONFIG_FILENAME
ARG DOCKER_BASE_IMAGE_ORIGIN="harbor5.ops.veritone.com/docker/"

# Alpine image
FROM ${DOCKER_BASE_IMAGE_ORIGIN}node:${NODE_VERSION}-alpine AS alpine
RUN apk update
RUN apk add --no-cache libc6-compat jq curl ca-certificates python3 make g++ bash

# Setup pnpm and turbo on the alpine base
FROM alpine AS base
RUN npm install pnpm@10.34.1 turbo --global
RUN pnpm config set store-dir ~/.pnpm-store

# Prune projects
FROM base AS pruner
ARG PROJECT

WORKDIR /app
COPY . .
RUN turbo prune --scope=core-graphql-server --docker

FROM base AS builder

WORKDIR /app
# Copy lockfile and package.json's of isolated subworkspace

COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=pruner /app/out/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=pruner /app/out/json/ .

# First install the dependencies (as they change less often)
RUN --mount=type=cache,id=pnpm,target=~/.pnpm-store pnpm install --frozen-lockfile

# Copy source code of isolated subworkspace
COPY --from=pruner /app/out/full/ .

RUN --mount=type=cache,id=pnpm,target=~/.pnpm-store pnpm turbo --filter=core-graphql-server run build
RUN --mount=type=cache,id=pnpm,target=~/.pnpm-store pnpm prune --prod --no-optional


FROM dependencies AS citestrunner
WORKDIR /app
ENTRYPOINT [ "npm" ]
CMD [ "run", "citest", "--", "-t", "___DO_NOTHING__" ]

FROM dependencies AS builder
RUN npm run build && \
    /app/buildinfo.sh && \
    npm dedupe && \
    NODE_ENV=production npm prune --production

# S3_BUCKET_LOCATION to be set by Jenkins
RUN if [ -n "${S3_BUCKET_LOCATION}" ]; then \
    pip3 install awscli --upgrade && \
    jq -r '.total | map_values(.pct|tostring) | "Lines: " + .lines + "% | Statements: " + .statements + "% | Functions: " + .functions + "% | Branches: " + .branches + "%"' coverage/coverage-summary.json > coverage/coverage-summary.txt && \
    aws s3 cp coverage "${S3_BUCKET_LOCATION}/test-results/coverage" --recursive; \
    fi

FROM ${DOCKER_BASE_IMAGE_ORIGIN}node:20-alpine3.18 AS final
# update npm own dependencies to fix security vulnerabilities
RUN npm update -g
RUN adduser -S app

RUN apk add vim jq curl bash openjdk11 tini ca-certificates && \
    apk upgrade --no-cache

# Flyway
ENV FLYWAY_VERSION=9.10.2
RUN mkdir /flyway && cd /flyway && curl -L https://repo1.maven.org/maven2/org/flywaydb/flyway-commandline/${FLYWAY_VERSION}/flyway-commandline-${FLYWAY_VERSION}.tar.gz -o flyway-commandline-${FLYWAY_VERSION}.tar.gz \
  && tar -xzf flyway-commandline-${FLYWAY_VERSION}.tar.gz --strip-components=1 \
  && rm flyway-commandline-${FLYWAY_VERSION}.tar.gz \
  && ln -sf /flyway/flyway /usr/local/bin/flyway

COPY --from=builder /app/ /app

WORKDIR /app
VOLUME ["/config"]

ENTRYPOINT ["/sbin/tini", "-v", "--", "node", "/app/services/api/core-graphql-server/server.js", "--conf", "/config/${CONFIG_FILENAME}", "--max_old_space_size=1978"]
