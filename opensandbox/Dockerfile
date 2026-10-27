FROM oven/bun:1.3.14
WORKDIR /opt/surface
COPY package.json ./
COPY opensandbox ./opensandbox
COPY src/surface ./src/surface
COPY .cursor/skills/surface-detection ./.cursor/skills/surface-detection
ENTRYPOINT ["bun", "/opt/surface/opensandbox/run.ts"]
