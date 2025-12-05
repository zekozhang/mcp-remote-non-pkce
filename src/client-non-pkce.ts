#!/usr/bin/env node

/**
 * MCP Client with OAuth 2.0 support (without PKCE)
 * 
 * This client uses standard OAuth 2.0 authorization code flow without PKCE,
 * suitable for OAuth servers that don't support PKCE.
 * 
 * Run with: npx tsx client-non-pkce.ts https://example.remote/server [callback-port] --static-oauth-client-info @oauth_client_info.json
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { ListResourcesResultSchema, ListToolsResultSchema } from '@modelcontextprotocol/sdk/types.js'
import {
  parseCommandLineArgs,
  setupSignalHandlers,
  log,
  MCP_REMOTE_VERSION,
} from './lib/utils'
import { StaticOAuthClientInformationFull, StaticOAuthClientMetadata } from './lib/types'
import { connectWithNonPkceOAuth } from './lib/oauth-connect-non-pkce'

/**
 * Main function to run the client with non-PKCE OAuth
 */
async function runClientNonPkce(
  serverUrl: string,
  callbackPort: number,
  headers: Record<string, string>,
  transportStrategy: 'sse-only' | 'http-only' | 'sse-first' | 'http-first' = 'http-first',
  host: string,
  staticOAuthClientMetadata: StaticOAuthClientMetadata,
  staticOAuthClientInfo: StaticOAuthClientInformationFull,
  authorizeResource: string,
  authTimeoutMs: number,
) {
  if (!staticOAuthClientInfo || !staticOAuthClientInfo.client_id) {
    log('Error: --static-oauth-client-info is required for non-PKCE OAuth mode')
    log('Usage: npx tsx client-non-pkce.ts <server-url> --static-oauth-client-info @oauth_client_info.json')
    process.exit(1)
  }

  // Create the client
  const client = new Client(
    {
      name: 'mcp-remote-non-pkce',
      version: MCP_REMOTE_VERSION,
    },
    {
      capabilities: {},
    },
  )

  try {
    // Connect to remote server using non-PKCE OAuth
    log('Connecting to remote server with non-PKCE OAuth...')
    const transport = await connectWithNonPkceOAuth(
      client,
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

    // Set up message and error handlers
    transport.onmessage = (message) => {
      log('Received message:', JSON.stringify(message, null, 2))
    }

    transport.onerror = (error) => {
      log('Transport error:', error)
    }

    transport.onclose = () => {
      log('Connection closed.')
      process.exit(0)
    }

    // Set up cleanup handler
    const cleanup = async () => {
      log('\nClosing connection...')
      await client.close()
      await transport.close()
    }
    setupSignalHandlers(cleanup)

    log('Connected successfully!')

    try {
      // Request tools list
      log('Requesting tools list...')
      const tools = await client.request({ method: 'tools/list' }, ListToolsResultSchema)
      log('Tools:', JSON.stringify(tools, null, 2))
    } catch (e) {
      log('Error requesting tools list:', e)
    }

    try {
      // Request resources list
      log('Requesting resource list...')
      const resources = await client.request({ method: 'resources/list' }, ListResourcesResultSchema)
      log('Resources:', JSON.stringify(resources, null, 2))
    } catch (e) {
      log('Error requesting resources list:', e)
    }

    log('Exiting OK...')
    process.exit(0)
  } catch (error) {
    log('Fatal error:', error)
    process.exit(1)
  }
}

// Parse command-line arguments and run the client
parseCommandLineArgs(process.argv.slice(2), 'Usage: npx tsx client-non-pkce.ts <https://server-url> [callback-port] [--static-oauth-client-info @file] [--debug]')
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
      authTimeoutMs,
    }) => {
      return runClientNonPkce(
        serverUrl,
        callbackPort,
        headers,
        transportStrategy,
        host,
        staticOAuthClientMetadata,
        staticOAuthClientInfo,
        authorizeResource || '',
        authTimeoutMs,
      )
    },
  )
  .catch((error) => {
    console.error('Fatal error:', error)
    process.exit(1)
  })

