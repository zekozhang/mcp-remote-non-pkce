# AGENT.md - mcp-remote Development Guide

## Commands

- **Build**: `pnpm build` (or `pnpm build:watch` for development)
- **Type check**: `pnpm check` (runs prettier and tsc)
- **Lint/Format**: `pnpm lint-fix` (prettier with write)
- **Test**: `pnpm test:unit` (or `pnpm test:unit:watch` for watch mode)
- **Run dev**: 
  - Standard: `npx tsx src/client.ts` or `npx tsx src/proxy.ts`
  - Non-PKCE: `npx tsx src/client-non-pkce.ts` or `npx tsx src/proxy-non-pkce.ts`

## Architecture

- **Project Type**: TypeScript ESM library for MCP (Model Context Protocol) remote proxy
- **Main Binaries**: 
  - `mcp-remote` (proxy.ts) - Standard proxy with PKCE OAuth
  - `mcp-remote-client` (client.ts) - Standard client with PKCE OAuth
  - `mcp-remote-non-pkce` (proxy-non-pkce.ts) - Proxy without PKCE OAuth
  - `mcp-remote-client-non-pkce` (client-non-pkce.ts) - Client without PKCE OAuth
- **Core Libraries**: `/src/lib/` contains auth coordination, OAuth client, utils, types
- **OAuth Implementations**:
  - **Standard (PKCE)**: Uses `NodeOAuthClientProvider` with PKCE flow
  - **Non-PKCE**: Uses `NonPkceOAuthProvider` with standard OAuth 2.0 authorization code flow
- **Transport**: Supports both HTTP and SSE transports with OAuth authentication
- **Config**: Uses `~/.mcp-auth/` directory for credential storage

## Code Style

- **Formatting**: Prettier with 140 char width, single quotes, no semicolons
- **Types**: Strict TypeScript, ES2022 target with bundler module resolution
- **Imports**: ES modules, use `.js` extensions for SDK imports
- **Error Handling**: EventEmitter pattern for auth flow coordination
- **Naming**: kebab-case for files, camelCase for variables/functions
- **Comments**: JSDoc for main functions, inline for complex auth flows

## Non-PKCE Implementation

The non-PKCE implementation provides an alternative OAuth flow for servers that don't support PKCE:

- **Files**: `*-non-pkce.ts` files in `/src/` and `/src/lib/`
- **Key Components**:
  - `oauth-provider-non-pkce.ts`: Implements standard OAuth 2.0 authorization code flow
  - `oauth-connect-non-pkce.ts`: Handles connection with non-PKCE OAuth
  - `proxy-non-pkce.ts`: Proxy binary for non-PKCE mode
  - `client-non-pkce.ts`: Client binary for non-PKCE mode
- **Requirements**: Requires `--static-oauth-client-info` with `client_id` and optionally `client_secret`
- **Use Case**: Legacy OAuth servers or servers that require pre-registered clients
