# `mcp-remote-non-pkce`

> **This is a fork of [mcp-remote](https://github.com/geelen/mcp-remote)** with added support for OAuth servers that don't support PKCE (Proof Key for Code Exchange). This package provides alternative binaries that use standard OAuth 2.0 authorization code flow without PKCE, making it compatible with legacy OAuth servers or servers that require pre-registered clients.

Connect an MCP Client that only supports local (stdio) servers to a Remote MCP Server, with auth support:

**Note: this is a working proof-of-concept** but should be considered **experimental**.

## Why is this necessary?

So far, the majority of MCP servers in the wild are installed locally, using the stdio transport. This has some benefits: both the client and the server can implicitly trust each other as the user has granted them both permission to run. Adding secrets like API keys can be done using environment variables and never leave your machine. And building on `npx` and `uvx` has allowed users to avoid explicit install steps, too.

But there's a reason most software that _could_ be moved to the web _did_ get moved to the web: it's so much easier to find and fix bugs & iterate on new features when you can push updates to all your users with a single deploy.

With the latest MCP [Authorization specification](https://modelcontextprotocol.io/specification/2025-03-26/basic/authorization), we now have a secure way of sharing our MCP servers with the world _without_ running code on user's laptops. Or at least, you would, if all the popular MCP _clients_ supported it yet. Most are stdio-only, and those that _do_ support HTTP+SSE don't yet support the OAuth flows required.

That's where `mcp-remote-non-pkce` comes in. As soon as your chosen MCP client supports remote, authorized servers, you can remove it. Until that time, drop in this one liner and connect to OAuth servers that don't support PKCE!

## Non-PKCE OAuth Support

For OAuth servers that don't support PKCE (Proof Key for Code Exchange), this package provides alternative binaries that use standard OAuth 2.0 authorization code flow without PKCE.

**When to use Non-PKCE mode:**
- Your OAuth server doesn't support PKCE
- You need to use pre-registered OAuth clients with static `client_id` and `client_secret`
- You're connecting to legacy OAuth servers

**Available Non-PKCE Binaries:**
- `mcp-remote-non-pkce`: Proxy mode (for MCP clients like Claude Desktop, Cursor, Windsurf)
- `mcp-remote-client-non-pkce`: Client mode (for direct testing)

**Note:** The non-PKCE mode uses standard OAuth 2.0 authorization code flow. Make sure your OAuth server supports this flow and that your `redirect_uri` matches exactly what's configured in your OAuth client registration.

## Configuration Methods

The non-PKCE mode **requires** `--static-oauth-client-info` to be provided. You can configure it in two ways:

### Method 1: Direct JSON String Configuration (Recommended)

Configure `client_id` and `client_secret` directly in the configuration file using a JSON string. This avoids the need for a separate JSON file.

**Claude Desktop Example:**

```json
{
  "mcpServers": {
    "my-non-pkce-server": {
      "command": "npx",
      "args": [
        "mcp-remote-non-pkce",
        "https://remote.mcp.server/sse",
        "--static-oauth-client-info",
        "{\"client_id\":\"your-client-id\",\"client_secret\":\"your-client-secret\",\"redirect_uris\":[\"http://localhost:3334/oauth/callback\"]}"
      ]
    }
  }
}
```

**Using Environment Variables (More Secure):**

```json
{
  "mcpServers": {
    "my-non-pkce-server": {
      "command": "npx",
      "args": [
        "mcp-remote-non-pkce",
        "https://remote.mcp.server/sse",
        "--static-oauth-client-info",
        "{\"client_id\":\"${MCP_CLIENT_ID}\",\"client_secret\":\"${MCP_CLIENT_SECRET}\",\"redirect_uris\":[\"http://localhost:3334/oauth/callback\"]}"
      ],
      "env": {
        "MCP_CLIENT_ID": "your-actual-client-id",
        "MCP_CLIENT_SECRET": "your-actual-client-secret"
      }
    }
  }
}
```

**Note:** Cursor and Claude Desktop (Windows) have a bug where spaces inside `args` aren't escaped when it invokes `npx`. Make sure there are no spaces around the `:` in the JSON string, or use environment variables as shown above.

### Method 2: JSON File Configuration

Create a JSON file (e.g., `oauth_client_info.json`) with your OAuth client credentials:

```json
{
  "client_id": "your-client-id",
  "client_secret": "your-client-secret",
  "redirect_uris": [
    "http://localhost:3334/oauth/callback"
  ]
}
```

Then reference it in your configuration:

```json
{
  "mcpServers": {
    "my-non-pkce-server": {
      "command": "npx",
      "args": [
        "mcp-remote-non-pkce",
        "https://remote.mcp.server/sse",
        "--static-oauth-client-info",
        "@/path/to/oauth_client_info.json"
      ]
    }
  }
}
```

**Complete Example for Claude Desktop (using file):**

```json
{
  "mcpServers": {
    "my-non-pkce-server": {
      "command": "npx",
      "args": [
        "mcp-remote-non-pkce",
        "https://remote.mcp.server/sse",
        "--static-oauth-client-info",
        "@/Users/username/.mcp-auth/oauth_client_info.json",
        "--debug"
      ]
    }
  }
}
```

## Client Setup

### Claude Desktop

[Official Docs](https://modelcontextprotocol.io/quickstart/user)

In order to add an MCP server to Claude Desktop you need to edit the configuration file located at:

* macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
* Windows: `%APPDATA%\Claude\claude_desktop_config.json`

If it does not exist yet, [you may need to enable it under Settings > Developer](https://modelcontextprotocol.io/quickstart/user#2-add-the-filesystem-mcp-server).

Restart Claude Desktop to pick up the changes in the configuration file. Upon restarting, you should see a hammer icon in the bottom right corner of the input box.

### Cursor

[Official Docs](https://docs.cursor.com/context/model-context-protocol). The configuration file is located at `~/.cursor/mcp.json`.

### Windsurf

[Official Docs](https://docs.codeium.com/windsurf/mcp). The configuration file is located at `~/.codeium/windsurf/mcp_config.json`.

## Additional Options

### Change OAuth Callback Port

To change which port `mcp-remote-non-pkce` listens for an OAuth redirect (by default `3334`), add an additional argument after the server URL:

```json
{
  "mcpServers": {
    "my-server": {
      "command": "npx",
      "args": [
        "mcp-remote-non-pkce",
        "https://remote.mcp.server/sse",
        "9696",
        "--static-oauth-client-info",
        "{\"client_id\":\"xxx\",\"client_secret\":\"yyy\",\"redirect_uris\":[\"http://localhost:9696/oauth/callback\"]}"
      ]
    }
  }
}
```

**Note:** If the specified port is unavailable, an open port will be chosen at random. Make sure your `redirect_uris` matches the port you specify.

### Change OAuth Callback Host

To change which host `mcp-remote-non-pkce` registers as the OAuth callback URL (by default `localhost`), add the `--host` flag:

```json
{
  "mcpServers": {
    "my-server": {
      "command": "npx",
      "args": [
        "mcp-remote-non-pkce",
        "https://remote.mcp.server/sse",
        "--host",
        "127.0.0.1",
        "--static-oauth-client-info",
        "{\"client_id\":\"xxx\",\"client_secret\":\"yyy\",\"redirect_uris\":[\"http://127.0.0.1:3334/oauth/callback\"]}"
      ]
    }
  }
}
```

### Enable Debug Logs

To enable detailed debugging logs, add the `--debug` flag. This will write verbose logs to `~/.mcp-auth/{server_hash}_debug.log` with timestamps and detailed information about the auth process, connections, and token refreshing:

```json
{
  "mcpServers": {
    "my-server": {
      "command": "npx",
      "args": [
        "mcp-remote-non-pkce",
        "https://remote.mcp.server/sse",
        "--static-oauth-client-info",
        "{\"client_id\":\"xxx\",\"client_secret\":\"yyy\",\"redirect_uris\":[\"http://localhost:3334/oauth/callback\"]}",
        "--debug"
      ]
    }
  }
}
```

### Change OAuth Callback Timeout

To change the timeout for the OAuth callback (by default `30` seconds), add the `--auth-timeout` flag with a value in seconds:

```json
{
  "mcpServers": {
    "my-server": {
      "command": "npx",
      "args": [
        "mcp-remote-non-pkce",
        "https://remote.mcp.server/sse",
        "--static-oauth-client-info",
        "{\"client_id\":\"xxx\",\"client_secret\":\"yyy\",\"redirect_uris\":[\"http://localhost:3334/oauth/callback\"]}",
        "--auth-timeout",
        "60"
      ]
    }
  }
}
```

### Transport Strategies

Specify the transport strategy with the `--transport` flag:

```json
{
  "mcpServers": {
    "my-server": {
      "command": "npx",
      "args": [
        "mcp-remote-non-pkce",
        "https://remote.mcp.server/sse",
        "--static-oauth-client-info",
        "{\"client_id\":\"xxx\",\"client_secret\":\"yyy\",\"redirect_uris\":[\"http://localhost:3334/oauth/callback\"]}",
        "--transport",
        "sse-only"
      ]
    }
  }
}
```

**Available Strategies:**
- `http-first` (default): Tries HTTP transport first, falls back to SSE if HTTP fails with a 404 error
- `sse-first`: Tries SSE transport first, falls back to HTTP if SSE fails with a 405 error
- `http-only`: Only uses HTTP transport, fails if the server doesn't support it
- `sse-only`: Only uses SSE transport, fails if the server doesn't support it

## Troubleshooting

### Clear your `~/.mcp-auth` directory

`mcp-remote-non-pkce` stores all the credential information inside `~/.mcp-auth` (or wherever your `MCP_REMOTE_CONFIG_DIR` points to). If you're having persistent issues, try running:

```sh
rm -rf ~/.mcp-auth
```

Then restarting your MCP client.

### Check your Node version

Make sure that the version of Node you have installed is [18 or higher](https://modelcontextprotocol.io/quickstart/server). Claude Desktop will use your system version of Node, even if you have a newer version installed elsewhere.

### Authentication Errors

If you encounter the following error, returned by the `/callback` URL:

```
Authentication Error
Token exchange failed: HTTP 400
```

You can run `rm -rf ~/.mcp-auth` to clear any locally stored state and tokens. Also verify that:
- Your `client_id` and `client_secret` are correct
- Your `redirect_uri` matches exactly what's configured in your OAuth server
- Your OAuth server supports the standard OAuth 2.0 authorization code flow (without PKCE)

### Check the logs

* [Follow Claude Desktop logs in real-time](https://modelcontextprotocol.io/docs/tools/debugging#debugging-in-claude-desktop)
* MacOS / Linux: `tail -n 20 -F ~/Library/Logs/Claude/mcp*.log`
* For bash on WSL: `tail -n 20 -f "C:\Users\YourUsername\AppData\Local\Claude\Logs\mcp.log"`
* Powershell: `Get-Content "C:\Users\YourUsername\AppData\Local\Claude\Logs\mcp.log" -Wait -Tail 20`

### Debug Logs

For troubleshooting complex issues, especially with token refreshing or authentication problems, use the `--debug` flag. This creates detailed logs in `~/.mcp-auth/{server_hash}_debug.log` with timestamps and complete information about every step of the connection and authentication process.

### "Client" mode

Run the following on the command line (not from an MCP server) to test your connection:

```shell
npx mcp-remote-client-non-pkce https://remote.mcp.server/sse --static-oauth-client-info "{\"client_id\":\"your-client-id\",\"client_secret\":\"your-client-secret\",\"redirect_uris\":[\"http://localhost:3334/oauth/callback\"]}"
```

This will run through the entire authorization flow and attempt to list the tools & resources at the remote URL. Try this after running `rm -rf ~/.mcp-auth` to see if stale credentials are your problem.
