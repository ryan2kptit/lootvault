# Local EVM chain for development: Foundry's anvil with on-disk state.
# Built from Docker Hub + GitHub Releases on purpose: pulls from ghcr.io fail (403)
# on the author's machine, and this keeps the setup reproducible elsewhere too.
FROM debian:bookworm-slim
ARG FOUNDRY_VERSION=v1.5.1
ARG TARGETARCH
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl \
 && curl -fsSL "https://github.com/foundry-rs/foundry/releases/download/${FOUNDRY_VERSION}/foundry_${FOUNDRY_VERSION}_linux_${TARGETARCH}.tar.gz" \
    | tar -xz -C /usr/local/bin anvil \
 && apt-get purge -y curl && apt-get autoremove -y && rm -rf /var/lib/apt/lists/*
EXPOSE 8545
ENTRYPOINT ["anvil"]
