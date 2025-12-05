/**
 * OAuth 2.0 Connection Helper (without PKCE)
 * 
 * This module provides a connection function that uses NonPkceOAuthProvider
 * to handle OAuth 2.0 authorization flow without PKCE, then connects to
 * the MCP server using the obtained access token.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'
import { EventEmitter } from 'events'
import { NonPkceOAuthProvider } from './oauth-provider-non-pkce'
import type { OAuthProviderOptions } from './types'
import { StaticOAuthClientInformationFull } from './types'
import { log, debugLog, TransportStrategy } from './utils'
import { setupOAuthCallbackServerWithLongPoll } from './utils'

/**
 * Parse WWW-Authenticate header to extract resource_metadata URL
 */
function parseWWWAuthenticate(wwwAuthenticate: string): string | null {
  // Parse header like: Bearer resource_metadata="https://example.dev/.well-known/oauth-protected-resource/mcp_example"
  const resourceMetadataMatch = wwwAuthenticate.match(/resource_metadata="([^"]+)"/)
  if (resourceMetadataMatch) {
    return resourceMetadataMatch[1]
  }
  return null
}

/**
 * Discover OAuth endpoints following MCP protocol flow:
 * 1. Call MCP Server endpoint without token (expect 401)
 * 2. Extract resource_metadata from WWW-Authenticate header
 * 3. Fetch protected-resource metadata to get authorization_servers
 * 4. Fetch authorization server metadata to get authorization_endpoint and token_endpoint
 */
async function discoverOAuthEndpoints(serverUrl: string, headers: Record<string, string> = {}): Promise<{
  authorizationEndpoint: string
  tokenEndpoint: string
}> {
  try {
    // Step 1: Call MCP Server endpoint without token to get 401 with WWW-Authenticate
    debugLog('Calling MCP Server endpoint to discover OAuth endpoints', serverUrl)
    const response = await fetch(serverUrl, {
      method: 'GET',
      headers: {
        ...headers,
        Accept: 'application/json',
      },
    })

    // Step 2: Extract resource_metadata from WWW-Authenticate header
    if (response.status === 401) {
      const wwwAuthenticate = response.headers.get('www-authenticate') || response.headers.get('WWW-Authenticate')
      if (wwwAuthenticate) {
        debugLog('Found WWW-Authenticate header', wwwAuthenticate)
        const resourceMetadataUrl = parseWWWAuthenticate(wwwAuthenticate)
        
        if (resourceMetadataUrl) {
          debugLog('Extracted resource_metadata URL', resourceMetadataUrl)
          
          // Step 3: Fetch protected-resource metadata
          try {
            const resourceMetadataResponse = await fetch(resourceMetadataUrl, {
              headers: {
                Accept: 'application/json',
              },
            })
            
            if (resourceMetadataResponse.ok) {
              const resourceMetadata = await resourceMetadataResponse.json()
              debugLog('Fetched protected-resource metadata', resourceMetadata)
              
              // Extract authorization_servers
              const authorizationServers = resourceMetadata.authorization_servers
              if (authorizationServers && authorizationServers.length > 0) {
                const authServerUrl = authorizationServers[0]
                debugLog('Found authorization server', authServerUrl)
                
                // Step 4: Fetch authorization server metadata
                const authServerMetadataUrl = new URL(authServerUrl)
                authServerMetadataUrl.pathname = '/.well-known/oauth-authorization-server'
                
                try {
                  const authServerMetadataResponse = await fetch(authServerMetadataUrl.toString(), {
                    headers: {
                      Accept: 'application/json',
                    },
                  })
                  
                  if (authServerMetadataResponse.ok) {
                    const authServerMetadata = await authServerMetadataResponse.json()
                    debugLog('Fetched authorization server metadata', authServerMetadata)
                    
                    if (authServerMetadata.authorization_endpoint && authServerMetadata.token_endpoint) {
                      debugLog('Found OAuth endpoints from authorization server metadata', {
                        authorizationEndpoint: authServerMetadata.authorization_endpoint,
                        tokenEndpoint: authServerMetadata.token_endpoint,
                      })
                      return {
                        authorizationEndpoint: authServerMetadata.authorization_endpoint,
                        tokenEndpoint: authServerMetadata.token_endpoint,
                      }
                    }
                  }
                } catch (error) {
                  debugLog('Failed to fetch authorization server metadata', error)
                }
              }
            }
          } catch (error) {
            debugLog('Failed to fetch protected-resource metadata', error)
          }
        }
      }
    } else {
      debugLog('MCP Server did not return 401, status:', response.status)
    }
  } catch (error) {
    debugLog('Failed to discover OAuth endpoints from MCP Server', error)
  }

  // Fallback: construct endpoints from server URL
  const baseUrl = new URL(serverUrl)
  const authorizationEndpoint = `${baseUrl.origin}/oauth/authorize`
  const tokenEndpoint = `${baseUrl.origin}/oauth/token`
  
  debugLog('Using fallback OAuth endpoints', {
    authorizationEndpoint,
    tokenEndpoint,
  })
  
  return { authorizationEndpoint, tokenEndpoint }
}

/**
 * Connect to remote server using OAuth 2.0 (without PKCE)
 */
export async function connectWithNonPkceOAuth(
  client: Client | null,
  serverUrl: string,
  options: OAuthProviderOptions,
  staticOAuthClientInfo: StaticOAuthClientInformationFull,
  headers: Record<string, string> = {},
  transportStrategy: TransportStrategy = 'http-first',
  authorizeResource?: string,
  authTimeoutMs: number = 30000,
): Promise<Transport> {
  if (!staticOAuthClientInfo || !staticOAuthClientInfo.client_id) {
    throw new Error('Static OAuth client information with client_id is required for non-PKCE OAuth')
  }

  const events = new EventEmitter()
  
  // Discover OAuth endpoints following MCP protocol flow
  const { authorizationEndpoint, tokenEndpoint } = await discoverOAuthEndpoints(serverUrl, headers)
  
  // Create non-PKCE OAuth provider
  const oauthProvider = new NonPkceOAuthProvider(options, staticOAuthClientInfo, events)
  
  // Get valid access token (will trigger auth flow if needed)
  log('Obtaining access token...')
  const accessToken = await oauthProvider.getValidAccessToken(
    authorizationEndpoint,
    tokenEndpoint,
    options.callbackPort,
    authorizeResource,
  )
  
  log('Access token obtained successfully')
  
  // Create transport with Authorization header
  const url = new URL(serverUrl)
  const sseTransport = transportStrategy === 'sse-only' || transportStrategy === 'sse-first'
  
  // Create a token provider that returns the access token
  const tokenProvider = {
    tokens: async () => {
      // Check if token is expired and refresh if needed
      const tokens = await oauthProvider.getTokens()
      if (tokens && tokens.expires_in && tokens.expires_in <= 0) {
        // Token expired, try to refresh
        try {
          const newTokens = await oauthProvider.refreshToken(tokenEndpoint)
          return {
            access_token: newTokens.access_token,
            token_type: newTokens.token_type || 'Bearer',
            expires_in: newTokens.expires_in,
            refresh_token: newTokens.refresh_token,
          }
        } catch (error) {
          debugLog('Token refresh failed, will need to re-authenticate', error)
          // Return existing token, connection will fail and trigger re-auth
          return tokens
        }
      }
      return tokens
    },
  }
  
  const transport = sseTransport
    ? new SSEClientTransport(url, {
        authProvider: tokenProvider as any,
        requestInit: {
          headers: {
            ...headers,
            Authorization: `Bearer ${accessToken}`,
          },
        },
        eventSourceInit: {
          fetch: (url: string | URL, init?: RequestInit) => {
            return tokenProvider.tokens().then((tokens) => {
              const initHeaders = init?.headers
              const headerRecord: Record<string, string> = {}
              
              // Convert Headers to plain object if needed
              if (initHeaders instanceof Headers) {
                initHeaders.forEach((value, key) => {
                  headerRecord[key] = value
                })
              } else if (initHeaders && typeof initHeaders === 'object') {
                Object.assign(headerRecord, initHeaders as Record<string, string>)
              }
              
              return fetch(url, {
                ...init,
                headers: {
                  ...headerRecord,
                  ...headers,
                  ...(tokens?.access_token ? { Authorization: `Bearer ${tokens.access_token}` } : {}),
                  Accept: 'text/event-stream',
                } as Record<string, string>,
              })
            })
          },
        },
      })
    : new StreamableHTTPClientTransport(url, {
        authProvider: tokenProvider as any,
        requestInit: {
          headers: {
            ...headers,
            Authorization: `Bearer ${accessToken}`,
          },
        },
      })

  try {
    debugLog('Connecting to remote server', { sseTransport })
    
    if (client) {
      debugLog('Connecting client to transport')
      await client.connect(transport)
    } else {
      debugLog('Starting transport directly')
      await transport.start()
    }
    
    log(`Connected to remote server using ${transport.constructor.name}`)
    return transport
  } catch (error: any) {
    log('Connection error:', error)
    debugLog('Connection error', {
      errorMessage: error.message,
      stack: error.stack,
      transportType: transport.constructor.name,
    })
    
    // If unauthorized, invalidate tokens and try again
    if (error instanceof Error && (error.message.includes('Unauthorized') || error.message.includes('401'))) {
      log('Unauthorized, invalidating tokens and re-authenticating...')
      await oauthProvider.invalidateTokens()
      
      // Try to get new token
      const newAccessToken = await oauthProvider.getValidAccessToken(
        authorizationEndpoint,
        tokenEndpoint,
        options.callbackPort,
        authorizeResource,
      )
      
      // Update transport headers
      // Note: This is a simplified approach. In production, you might want to recreate the transport
      log('Re-authenticated, please retry the connection')
      throw new Error('Please retry after re-authentication')
    }
    
    throw error
  }
}

