#!/usr/bin/env node

/**
 * MCP Proxy with OAuth 2.0 support (without PKCE)
 * 
 * A bidirectional proxy between a local STDIO MCP server and a remote SSE server
 * with standard OAuth 2.0 authentication (without PKCE).
 * 
 * Suitable for OAuth servers that don't support PKCE.
 * 
 * Run with: npx tsx proxy-non-pkce.ts https://example.remote/server [callback-port] --static-oauth-client-info @oauth_client_info.json
 * 
 * For Cursor configuration:
 * {
 *   "mcpServers": {
 *     "my-server": {
 *       "command": "npx",
 *       "args": [
 *         "tsx",
 *         "path/to/proxy-non-pkce.ts",
 *         "https://remote.server/sse",
 *         "--static-oauth-client-info",
 *         "@/path/to/oauth_client_info.json"
 *       ]
 *     }
 *   }
 * }
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  log,
  mcpProxy,
  parseCommandLineArgs,
  setupSignalHandlers,
  TransportStrategy,
} from './lib/utils'
import { StaticOAuthClientInformationFull, StaticOAuthClientMetadata } from './lib/types'
import { connectWithNonPkceOAuth } from './lib/oauth-connect-non-pkce'

/**
 * Main function to run the proxy with non-PKCE OAuth
 */
async function runProxyNonPkce(
  serverUrl: string,
  callbackPort: number,
  headers: Record<string, string>,
  transportStrategy: TransportStrategy = 'http-first',
  host: string,
  staticOAuthClientMetadata: StaticOAuthClientMetadata,
  staticOAuthClientInfo: StaticOAuthClientInformationFull,
  authorizeResource: string,
  ignoredTools: string[],
  authTimeoutMs: number,
) {
  if (!staticOAuthClientInfo || !staticOAuthClientInfo.client_id) {
    log('Error: --static-oauth-client-info is required for non-PKCE OAuth mode')
    log('Usage: npx tsx proxy-non-pkce.ts <server-url> --static-oauth-client-info @oauth_client_info.json')
    process.exit(1)
  }

  // Create the STDIO transport for local connections
  const localTransport = new StdioServerTransport()

  try {
    // Connect to remote server using non-PKCE OAuth
    log('Connecting to remote server with non-PKCE OAuth...')
    const remoteTransport = await connectWithNonPkceOAuth(
      null, // No client needed for proxy mode
      serverUrl,
      {
        serverUrl,
        callbackPort,
        host,
        staticOAuthClientMetadata,
        staticOAuthClientInfo,
        authorizeResource,
      },
      staticOAuthClientInfo,
      headers,
      transportStrategy,
      authorizeResource,
      authTimeoutMs,
    )

    // Set up bidirectional proxy between local and remote transports
    mcpProxy({
      transportToClient: localTransport,
      transportToServer: remoteTransport,
      ignoredTools,
    })

    // Start the local STDIO server
    await localTransport.start()
    log('Local STDIO server running')
    log(`Proxy established successfully between local STDIO and remote ${remoteTransport.constructor.name}`)
    log('Press Ctrl+C to exit')

    // Setup cleanup handler
    const cleanup = async () => {
      await remoteTransport.close()
      await localTransport.close()
    }
    setupSignalHandlers(cleanup)
  } catch (error) {
    log('Fatal error:', error)
    if (error instanceof Error && error.message.includes('self-signed certificate in certificate chain')) {
      log(`You may be behind a VPN!

If you are behind a VPN, you can try setting the NODE_EXTRA_CA_CERTS environment variable to point
to the CA certificate file. If using Cursor mcp.json, this might look like:

{
  "mcpServers": {
    "my-server": {
      "command": "npx",
      "args": [
        "tsx",
        "proxy-non-pkce.ts",
        "https://remote.mcp.server/sse",
        "--static-oauth-client-info",
        "@/path/to/oauth_client_info.json"
      ],
      "env": {
        "NODE_EXTRA_CA_CERTS": "\${your CA certificate file path}.pem"
      }
    }
  }
}
      `)
    }
    process.exit(1)
  }
}

// Parse command-line arguments and run the proxy
parseCommandLineArgs(process.argv.slice(2), 'Usage: npx tsx proxy-non-pkce.ts <https://server-url> [callback-port] [--static-oauth-client-info @file] [--debug]')
  .then(
    ({
      serverUrl,
      callbackPort,
      headers,
      transportStrategy,
      host,
      staticOAuthClientMetadata,
      staticOAuthClientInfo,
      authorizeResource,
      ignoredTools,
      authTimeoutMs,
    }) => {
      return runProxyNonPkce(
        serverUrl,
        callbackPort,
        headers,
        transportStrategy,
        host,
        staticOAuthClientMetadata,
        staticOAuthClientInfo,
        authorizeResource || '',
        ignoredTools,
        authTimeoutMs,
      )
    },
  )
  .catch((error) => {
    log('Fatal error:', error)
    process.exit(1)
  })

