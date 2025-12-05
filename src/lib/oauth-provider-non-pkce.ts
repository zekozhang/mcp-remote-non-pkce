/**
 * OAuth 2.0 Provider (without PKCE)
 * 
 * This provider implements standard OAuth 2.0 authorization code flow
 * without PKCE support, for servers that don't support PKCE.
 * 
 * It handles the complete OAuth flow:
 * 1. Generate authorization URL
 * 2. Start callback server to receive authorization code
 * 3. Exchange authorization code for access token
 * 4. Store and manage tokens
 */

import open from 'open'
import express from 'express'
import { EventEmitter } from 'events'
import { randomUUID } from 'node:crypto'
import { sanitizeUrl } from 'strict-url-sanitise'
import type { OAuthProviderOptions } from './types'
import { StaticOAuthClientInformationFull } from './types'
import {
  readJsonFile,
  writeJsonFile,
  deleteConfigFile,
} from './mcp-auth-config'
import {
  getServerUrlHash,
  log,
  debugLog,
} from './utils'
import { OAuthTokens, OAuthTokensSchema } from '@modelcontextprotocol/sdk/shared/auth.js'
import { setupOAuthCallbackServerWithLongPoll } from './utils'

/**
 * OAuth 2.0 Provider without PKCE
 */
export class NonPkceOAuthProvider {
  private serverUrlHash: string
  private callbackPath: string
  private clientId: string
  private clientSecret: string | undefined
  private redirectUri: string
  private serverUrl: string
  private events: EventEmitter
  private callbackServer: any = null
  private _state: string

  constructor(
    options: OAuthProviderOptions,
    staticOAuthClientInfo: StaticOAuthClientInformationFull,
    events: EventEmitter,
  ) {
    this.serverUrlHash = getServerUrlHash(options.serverUrl)
    this.serverUrl = options.serverUrl
    this.callbackPath = options.callbackPath || '/oauth/callback'
    this.redirectUri = `http://${options.host}:${options.callbackPort}${this.callbackPath}`
    this.events = events
    this._state = randomUUID()

    // Extract client_id and client_secret from static client info
    if (!staticOAuthClientInfo || !staticOAuthClientInfo.client_id) {
      throw new Error('Static OAuth client information with client_id is required')
    }

    this.clientId = staticOAuthClientInfo.client_id
    this.clientSecret = staticOAuthClientInfo.client_secret
  }

  /**
   * Get stored OAuth tokens
   */
  async getTokens(): Promise<OAuthTokens | undefined> {
    debugLog('Reading OAuth tokens')
    const tokens = await readJsonFile<OAuthTokens>(this.serverUrlHash, 'tokens.json', OAuthTokensSchema)
    
    if (tokens) {
      const timeLeft = tokens.expires_in || 0

      // Alert if expires_in is invalid (same as SDK)
      if (typeof tokens.expires_in !== 'number' || tokens.expires_in < 0) {
        debugLog('⚠️ WARNING: Invalid expires_in detected while reading tokens ⚠️', {
          expiresIn: tokens.expires_in,
          tokenObject: JSON.stringify(tokens),
          stack: new Error('Invalid expires_in value').stack,
        })
      }

      debugLog('Token result:', {
        found: true,
        hasAccessToken: !!tokens.access_token,
        hasRefreshToken: !!tokens.refresh_token,
        expiresIn: `${timeLeft} seconds`,
        isExpired: timeLeft <= 0,
        expiresInValue: tokens.expires_in,
      })
    } else {
      debugLog('Token result: Not found')
    }
    
    return tokens
  }

  /**
   * Save OAuth tokens
   */
  async saveTokens(tokens: OAuthTokens): Promise<void> {
    const timeLeft = tokens.expires_in || 0

    // Alert if expires_in is invalid (same as SDK)
    if (typeof tokens.expires_in !== 'number' || tokens.expires_in < 0) {
      debugLog('⚠️ WARNING: Invalid expires_in detected in tokens ⚠️', {
        expiresIn: tokens.expires_in,
        tokenObject: JSON.stringify(tokens),
        stack: new Error('Invalid expires_in value').stack,
      })
    }

    debugLog('Saving tokens', {
      hasAccessToken: !!tokens.access_token,
      hasRefreshToken: !!tokens.refresh_token,
      expiresIn: `${timeLeft} seconds`,
      expiresInValue: tokens.expires_in,
    })
    
    // Store tokens in the same location as SDK: {server_hash}_tokens.json
    await writeJsonFile(this.serverUrlHash, 'tokens.json', tokens)
  }

  /**
   * Get authorization URL
   */
  getAuthorizationUrl(authorizationEndpoint: string, authorizeResource?: string): URL {
    const url = new URL(authorizationEndpoint)
    url.searchParams.set('response_type', 'code')
    url.searchParams.set('client_id', this.clientId)
    url.searchParams.set('redirect_uri', this.redirectUri)
    url.searchParams.set('state', this._state)
    
    if (authorizeResource) {
      url.searchParams.set('resource', authorizeResource)
    }

    return url
  }

  /**
   * Start OAuth authorization flow
   */
  async startAuthorization(
    authorizationEndpoint: string,
    tokenEndpoint: string,
    callbackPort: number,
    authorizeResource?: string,
    authTimeoutMs: number = 30000,
  ): Promise<OAuthTokens> {
    // Check if we already have valid tokens
    const existingTokens = await this.getTokens()
    if (existingTokens && existingTokens.access_token) {
      // Check if token is expired
      if (existingTokens.expires_in && existingTokens.expires_in > 0) {
        debugLog('Using existing valid tokens')
        return existingTokens
      }
    }

    // Set up callback server
    const { server, waitForAuthCode } = setupOAuthCallbackServerWithLongPoll({
      port: callbackPort,
      path: this.callbackPath,
      events: this.events,
      authTimeoutMs,
    })
    this.callbackServer = server

    try {
      // Get authorization URL
      const authUrl = this.getAuthorizationUrl(authorizationEndpoint, authorizeResource)
      
      log(`\nPlease authorize this client by visiting:\n${authUrl.toString()}\n`)
      debugLog('Redirecting to authorization URL', authUrl.toString())

      // Open browser
      try {
        await open(sanitizeUrl(authUrl.toString()))
        log('Browser opened automatically.')
      } catch (error) {
        log('Could not open browser automatically. Please copy and paste the URL above into your browser.')
        debugLog('Failed to open browser', error)
      }

      // Wait for authorization code
      log('Waiting for authorization...')
      const authCode = await waitForAuthCode()
      debugLog('Received authorization code')

      // Exchange authorization code for access token
      log('Exchanging authorization code for access token...')
      const tokens = await this.exchangeCodeForToken(authCode, tokenEndpoint)
      
      // Save tokens
      await this.saveTokens(tokens)
      
      log('Authorization successful!')
      return tokens
    } finally {
      // Close callback server
      if (this.callbackServer) {
        this.callbackServer.close()
        this.callbackServer = null
      }
    }
  }

  /**
   * Exchange authorization code for access token
   */
  private async exchangeCodeForToken(authorizationCode: string, tokenEndpoint: string): Promise<OAuthTokens> {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code: authorizationCode,
      redirect_uri: this.redirectUri,
      client_id: this.clientId,
    })

    // Add client_secret if available
    if (this.clientSecret) {
      body.append('client_secret', this.clientSecret)
    }

    debugLog('Exchanging code for token', {
      tokenEndpoint,
      hasClientSecret: !!this.clientSecret,
    })

    const response = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
      },
      body: body.toString(),
    })

    if (!response.ok) {
      const errorText = await response.text()
      debugLog('Token exchange failed', {
        status: response.status,
        statusText: response.statusText,
        error: errorText,
      })
      throw new Error(`Token exchange failed: HTTP ${response.status} - ${errorText}`)
    }

    const tokenData = await response.json()
    debugLog('Token exchange successful', {
      hasAccessToken: !!tokenData.access_token,
      hasRefreshToken: !!tokenData.refresh_token,
      expiresIn: tokenData.expires_in,
    })

    // Convert to OAuthTokens format
    const tokens: OAuthTokens = {
      access_token: tokenData.access_token,
      token_type: tokenData.token_type || 'Bearer',
      expires_in: tokenData.expires_in,
      refresh_token: tokenData.refresh_token,
      scope: tokenData.scope,
    }

    return tokens
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshToken(tokenEndpoint: string): Promise<OAuthTokens> {
    const existingTokens = await this.getTokens()
    if (!existingTokens || !existingTokens.refresh_token) {
      throw new Error('No refresh token available')
    }

    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: existingTokens.refresh_token,
      client_id: this.clientId,
    })

    if (this.clientSecret) {
      body.append('client_secret', this.clientSecret)
    }

    debugLog('Refreshing token')

    const response = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
      },
      body: body.toString(),
    })

    if (!response.ok) {
      const errorText = await response.text()
      debugLog('Token refresh failed', {
        status: response.status,
        statusText: response.statusText,
        error: errorText,
      })
      throw new Error(`Token refresh failed: HTTP ${response.status} - ${errorText}`)
    }

    const tokenData = await response.json()
    const tokens: OAuthTokens = {
      access_token: tokenData.access_token,
      token_type: tokenData.token_type || 'Bearer',
      expires_in: tokenData.expires_in,
      refresh_token: tokenData.refresh_token || existingTokens.refresh_token,
      scope: tokenData.scope,
    }

    await this.saveTokens(tokens)
    return tokens
  }

  /**
   * Get valid access token (refresh if needed)
   * 
   * This method:
   * 1. Checks if we have valid tokens (not expired)
   * 2. If expired, tries to refresh using refresh_token
   * 3. If refresh fails or no refresh_token, starts new authorization flow
   * 4. Returns a valid access token
   */
  async getValidAccessToken(
    authorizationEndpoint: string,
    tokenEndpoint: string,
    callbackPort: number,
    authorizeResource?: string,
  ): Promise<string> {
    let tokens = await this.getTokens()

    // Check if token is expired or missing
    // expires_in <= 0 means expired (same logic as SDK)
    if (!tokens || !tokens.access_token || (tokens.expires_in !== undefined && tokens.expires_in <= 0)) {
      debugLog('Token expired or missing, attempting refresh or re-authorization')
      
      // Try to refresh if we have a refresh token
      if (tokens && tokens.refresh_token) {
        try {
          debugLog('Attempting to refresh token using refresh_token')
          tokens = await this.refreshToken(tokenEndpoint)
          debugLog('Token refreshed successfully')
        } catch (error) {
          debugLog('Token refresh failed, starting new authorization', error)
          // Refresh failed, start new authorization flow
          tokens = await this.startAuthorization(
            authorizationEndpoint,
            tokenEndpoint,
            callbackPort,
            authorizeResource,
          )
        }
      } else {
        // No refresh token available, start new authorization flow
        debugLog('No refresh token available, starting new authorization')
        tokens = await this.startAuthorization(
          authorizationEndpoint,
          tokenEndpoint,
          callbackPort,
          authorizeResource,
        )
      }
    } else if (tokens && tokens.access_token) {
      debugLog('Using existing valid token', {
        expiresIn: tokens.expires_in,
        hasRefreshToken: !!tokens.refresh_token,
      })
    }

    if (!tokens || !tokens.access_token) {
      throw new Error('Failed to obtain access token')
    }

    return tokens.access_token
  }

  /**
   * Invalidate tokens
   */
  async invalidateTokens(): Promise<void> {
    debugLog('Invalidating tokens')
    await deleteConfigFile(this.serverUrlHash, 'tokens.json')
  }

  /**
   * Close callback server
   */
  close(): void {
    if (this.callbackServer) {
      this.callbackServer.close()
      this.callbackServer = null
    }
  }
}

