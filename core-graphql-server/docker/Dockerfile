ARG DOCKER_BASE_IMAGE="registry.central.aiware.com/fed-nodejs:20.20.2-slim"
FROM aidata_build_source AS runner
WORKDIR /app
RUN --mount=type=cache,id=pnpm,target=~/.pnpm-store pnpm install --frozen-lockfile
RUN pnpm --filter ts-messaging-lib run build
ENTRYPOINT [ "pnpm" ]
CMD [ "--filter", "core-graphql-server", "run", "test" ]

FROM aidata_build_source AS citest-runner-pruner
ARG PROJECT="core-graphql-server"
ARG PROJECT_TYPE="api"
WORKDIR /app
RUN --mount=type=cache,id=pnpm,target=~/.pnpm-store pnpm install --frozen-lockfile
RUN pnpm --filter=${PROJECT} deploy --legacy dist
ENTRYPOINT [ "tail", "-f", "/dev/null" ]

FROM aidata_build_base AS citest-runner
WORKDIR /app
COPY --from=citest-runner-pruner /app/dist /app
ENTRYPOINT [ "npx" ]
CMD [ "jest", "--coverage", "--coverageDirectory=coverage" ]

FROM ${DOCKER_BASE_IMAGE}
USER root
RUN apk add jq ca-certificates curl bash openjdk17-jre && \
	apk upgrade --no-cache
	
RUN addgroup -S app && adduser -S app -G app
RUN npm update -g

# Flyway
ENV FLYWAY_VERSION=10.15.0
RUN mkdir /flyway && cd /flyway && curl -fL --retry 5 --retry-delay 2 --retry-all-errors --retry-max-time 120 \
    -o flyway-commandline-${FLYWAY_VERSION}.tar.gz \
    https://repo1.maven.org/maven2/org/flywaydb/flyway-commandline/${FLYWAY_VERSION}/flyway-commandline-${FLYWAY_VERSION}.tar.gz \
  && tar -xzf flyway-commandline-${FLYWAY_VERSION}.tar.gz --strip-components=1 \
  && rm flyway-commandline-${FLYWAY_VERSION}.tar.gz \
  && rm ./drivers/snowflake-* && rm -rf ./drivers/gcp && rm ./drivers/databricks-* && rm ./drivers/sqlite-* \ 
  && chown app -R /flyway
RUN ln -sf /flyway/flyway /usr/local/bin/flyway

# graphql-server

COPY --from=aidata_build --chown=app:app /dist/core-graphql-server /app/
# Manifest-only shim so Wiz's image CVE scan can see the app's real npm dependency tree
# (ncc bundles everything into dist/ above, leaving no package.json/lockfile for Wiz's
# SBOM builder to read). Nothing executes this path.
COPY --from=aidata_build --chown=app:app /dist/manifests /app/.wiz-manifest/
COPY --chown=app:app ./*.sh /app/
COPY --chown=app:app ./flyway /app/flyway
COPY --chown=app:app ./config /app/config 
COPY --chown=app:app ./schema /app/schema
COPY --chown=app:app ./keys /app/keys
COPY --chown=app:app ./modules /app/modules
COPY --chown=app:app ./buildinfo.json* /app/

WORKDIR /app

ENV APPLICATION=core-graphql-server NODE_ENV=production NODE_OPTIONS=--max_old_space_size=3072

USER app
RUN chmod +x *.sh && touch production.mark

ENTRYPOINT [ "./entrypoint.sh" ]