# 发布到 npm 的步骤指南

## 准备工作

### 1. 更新 package.json

在发布前，请确保更新以下字段：

- **author**: 你的名字和邮箱（例如：`"Your Name <your.email@example.com>"`）
- **repository.url**: 你的 GitHub 仓库地址（例如：`"https://github.com/yourusername/mcp-remote-non-pkce"`）
- **version**: 当前版本号（已设置为 `0.1.0`）

### 2. 检查 npm 账户

确保你已经：
- 注册了 npm 账户：https://www.npmjs.com/signup
- 在本地登录 npm：`npm login`

### 3. 检查包名可用性

在发布前，检查包名是否可用：

```bash
npm view mcp-remote-non-pkce
```

如果返回 404，说明包名可用。如果已存在，需要修改 `package.json` 中的 `name` 字段。

## 发布步骤

### 1. 构建项目

```bash
pnpm build
```

这会生成 `dist/` 目录，包含所有编译后的文件。

### 2. 检查构建结果

确保 `dist/` 目录包含以下文件：
- `proxy.js`
- `client.js`
- `proxy-non-pkce.js`
- `client-non-pkce.js`
- 以及对应的 `.d.ts` 类型定义文件

### 3. 运行测试（可选但推荐）

```bash
pnpm test:unit
```

### 4. 检查要发布的文件

查看哪些文件会被发布到 npm：

```bash
npm pack --dry-run
```

这会显示将要打包的文件列表。确保只包含必要的文件（`dist/`, `README.md`, `LICENSE`）。

### 5. 登录 npm

如果还没有登录：

```bash
npm login
```

输入你的 npm 用户名、密码和邮箱。

### 6. 发布到 npm

#### 首次发布（公开包）

```bash
npm publish --access public
```

#### 或者发布为私有包（需要付费账户）

```bash
npm publish --access restricted
```

### 7. 验证发布

发布后，访问以下 URL 验证：

```
https://www.npmjs.com/package/mcp-remote-non-pkce
```

## 后续版本更新

### 更新版本号

使用 npm version 命令自动更新版本号并创建 git tag：

```bash
# 补丁版本 (0.1.0 -> 0.1.1)
npm version patch

# 次要版本 (0.1.0 -> 0.2.0)
npm version minor

# 主要版本 (0.1.0 -> 1.0.0)
npm version major
```

### 发布新版本

```bash
pnpm build
npm publish --access public
```

## 常见问题

### 1. 包名冲突

如果包名已被占用，可以：
- 使用带 scope 的包名：`@yourusername/mcp-remote-non-pkce`
- 修改 package.json：
  ```json
  {
    "name": "@yourusername/mcp-remote-non-pkce"
  }
  ```
- 发布时使用：`npm publish --access public`（scope 包默认是私有的，需要 `--access public`）

### 2. 权限错误

如果遇到权限错误，检查：
- 是否已登录：`npm whoami`
- 包名是否属于你或你的组织

### 3. 发布后无法立即看到

npm 的 CDN 可能需要几分钟来同步。等待 2-5 分钟后刷新页面。

### 4. 撤销发布

如果发布了错误的版本，可以在 72 小时内撤销：

```bash
npm unpublish mcp-remote-non-pkce@0.1.0
```

**注意**：撤销发布应该谨慎使用，特别是如果已经有用户在使用你的包。

## 发布检查清单

- [ ] 更新了 `package.json` 中的 `author` 和 `repository`
- [ ] 运行了 `pnpm build` 并确认构建成功
- [ ] 运行了 `npm pack --dry-run` 检查要发布的文件
- [ ] 检查了包名可用性
- [ ] 已登录 npm：`npm login`
- [ ] 更新了版本号（首次发布使用 0.1.0）
- [ ] 运行了 `npm publish --access public`
- [ ] 验证了包在 npm 上可见

## 使用已发布的包

发布后，用户可以通过以下方式使用：

```bash
# 使用 non-pkce 代理
npx mcp-remote-non-pkce https://remote.mcp.server/sse --static-oauth-client-info @/path/to/oauth_client_info.json

# 使用 non-pkce 客户端
npx mcp-remote-client-non-pkce https://remote.mcp.server/sse --static-oauth-client-info @/path/to/oauth_client_info.json
```

