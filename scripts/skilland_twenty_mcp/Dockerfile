FROM node:24.5.0-alpine

WORKDIR /opt/skilland-crm-mcp

COPY scripts/skilland_twenty_mcp/policy.mjs ./scripts/skilland_twenty_mcp/policy.mjs
COPY scripts/skilland_twenty_mcp/server.mjs ./scripts/skilland_twenty_mcp/server.mjs

ENV NODE_ENV=production
ENV PORT=3100
# Dentro del contenedor hay que escuchar en todas las interfaces; fuera, el defecto es 127.0.0.1.
ENV SKILLAND_MCP_HOST=0.0.0.0

EXPOSE 3100

USER node

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O - http://127.0.0.1:3100/healthz >/dev/null || exit 1

CMD ["node", "scripts/skilland_twenty_mcp/server.mjs"]
