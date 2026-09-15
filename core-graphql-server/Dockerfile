ARG DOCKER_BASE_IMAGE_ORIGIN="harbor5.ops.veritone.com/docker/"
FROM ${DOCKER_BASE_IMAGE_ORIGIN}node:20.19.5-alpine3.22 AS dependencies
ARG GITHUB_ACCESS_TOKEN
ARG S3_BUCKET_LOCATION
ARG TESTS_USER
ARG TESTS_PASSWORD
ARG TESTS_TOKEN
RUN cat /etc/apk/repositories

RUN apk add --no-cache ca-certificates git make g++ jq python3-dev py3-pip curl bash && \
    apk upgrade --no-cache && \
    git config --global url."https://${GITHUB_ACCESS_TOKEN}:x-oauth-basic@github.com/".insteadOf "https://github.com/"

RUN mkdir /app
COPY . /app
WORKDIR /app
RUN echo "//npm.pkg.github.com/:_authToken=${GITHUB_ACCESS_TOKEN}" >> ~/.npmrc && cat ~/.npmrc

# build graphiql
RUN cd /app/graphiql && npm ci --force && npm run build_app && cd ../

RUN chmod +x /app/buildinfo.sh && \
    npm ci --retry 5

FROM dependencies AS builder
RUN npm run build && \
    npm run test && \
    /app/buildinfo.sh && \
    npm dedupe && \
    NODE_ENV=production npm prune --production

# S3_BUCKET_LOCATION to be set by Jenkins
RUN if [ -n "${S3_BUCKET_LOCATION}" ]; then \
    pip3 install awscli --upgrade && \
    jq -r '.total | map_values(.pct|tostring) | "Lines: " + .lines + "% | Statements: " + .statements + "% | Functions: " + .functions + "% | Branches: " + .branches + "%"' coverage/coverage-summary.json > coverage/coverage-summary.txt && \
    aws s3 cp coverage "${S3_BUCKET_LOCATION}/test-results/coverage" --recursive; \
  fi

FROM ${DOCKER_BASE_IMAGE_ORIGIN}node:20.19.5-alpine3.22 AS final
# update npm own dependencies to fix security vulnerabilities
RUN npm update -g
RUN adduser -S app
RUN cat /etc/apk/repositories

RUN apk add ca-certificates vim jq curl bash openjdk17 && \
    apk upgrade --no-cache

COPY --from=builder /app /app
RUN rm -rf /app/citest

# Flyway
WORKDIR /flyway
ENV FLYWAY_VERSION="10.15.0"
RUN curl -L https://repo1.maven.org/maven2/org/flywaydb/flyway-commandline/${FLYWAY_VERSION}/flyway-commandline-${FLYWAY_VERSION}.tar.gz -o flyway-commandline-${FLYWAY_VERSION}.tar.gz \
  && tar -xzf flyway-commandline-${FLYWAY_VERSION}.tar.gz --strip-components=1 \
  && rm flyway-commandline-${FLYWAY_VERSION}.tar.gz
RUN ln -sf /flyway/flyway /usr/local/bin/flyway

WORKDIR /app
ENV CONFIG_PATH http://localhost/base.json
RUN chmod +x /app/*.sh

# Run under Tini to ensure that SIGTERM and SIGQUIT signals are passed to Node process
RUN apk add --no-cache tini
ENTRYPOINT ["/sbin/tini", "-v", "--", "/app/entrypoint.sh"]
