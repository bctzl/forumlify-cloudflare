# Forumlify NEXT Edition（Cloudflare Workers 适配版）

> 一个简洁、优雅的现代社区系统。本 fork 适配 **Cloudflare Workers + Neon PostgreSQL + Backblaze B2**。

本仓库是 [forumlify/public](https://github.com/forumlify/public) `next` 分支的 fork，针对 **Cloudflare Workers 免费版**做了适配。

原版依赖传统 PostgreSQL 连接池，在 Workers 上会因跨请求 TCP 连接复用而卡死（`Worker's code had hung`）。本 fork 把数据库连接换成 **Neon HTTP 驱动**，存储换成 **Backblaze B2 + B2 Proxy**，让论坛能在 Cloudflare Workers 上稳定运行。

## ⚠️ 与上游的差异

本 fork 改动了以下文件，**不适用于 VPS / Docker 部署**：

| 文件 | 改动 |
|:---|:---|
| `lib/db.js` | `pg.Pool` → Neon HTTP 驱动，包装成兼容 `pool.query` 的接口 |
| `lib/post-reference.js` | 去掉 `pool.connect()`、事务和 `pg_advisory_xact_lock`，改为逐条 `pool.query` |
| `lib/storage.js` | `s3` 分支增加 `putRes.ok` 检查，上传失败时暴露错误 |
| `app/api/upload/route.js` | `catch` 块返回 `detail`，便于排查 |
| `app/api/settings/route.js` | SQL 改用 `EXCLUDED.value`，避免占位符重复 |
| `package.json` | `build` 脚本从 `node scripts/build.js` 改为 `next build`，避免 OpenNext 构建死循环 |
| `wrangler.jsonc` | 注释掉 R2 绑定，改用 B2 |

如需 VPS / Docker 部署，请使用[上游原仓库](https://github.com/forumlify/public)。

## ✨ 特性

- 🎨 精致简约的界面设计，支持亮色/暗色模式
- ⚡️ 基于 Next.js 16 (App Router) + React 19
- 🔐 自带用户认证（JWT）
- 📝 发帖、回复、举报、管理后台
- ☁️ 部署在 Cloudflare Workers，无需维护常驻服务器

## 🚀 快速开始

### 环境要求

- Node.js 20.9+
- Cloudflare 账号（免费版即可）
- Neon PostgreSQL 账号（免费版即可）
- Backblaze B2 账号（免费 10GB）

### 1. 准备数据库（Neon）

1. 注册 [Neon](https://neon.tech)，创建一个项目。
2. 在 SQL Editor 里执行仓库根目录的 `schema.sql`。
3. 复制连接串，**去掉末尾的 `&channel_binding=require`**（Neon HTTP 驱动不支持）。

连接串格式：

```
postgresql://user:password@host/dbname?sslmode=require
```

### 2. 准备存储（Backblaze B2）

1. 注册 [Backblaze B2](https://www.backblaze.com/b2/cloud-storage.html)，创建一个**私有桶**。
2. 生成 Application Key，记下 `keyID` 和 `applicationKey`。
3. 部署 [B2 Proxy Worker](https://github.com/hoochanlon/CF-Proxy-B2)，把私有桶公开化。
4. 给 B2 Proxy Worker 绑一个自定义域名，例如 `b2.yourdomain.com`。

### 3. 配置环境变量

在 Cloudflare Dashboard → 你的 Worker → **Settings → Variables and Secrets** 添加：

| 变量 | 必填 | 说明 |
|:---|:---|:---|
| `DATABASE_URL` | ✅ | Neon 连接串，**去掉 `&channel_binding=require`** |
| `JWT_SECRET` | ✅ | JWT 签名密钥，任意长随机字符串 |
| `S3_ENDPOINT` | 上传图片时 | B2 的 S3 端点，**不带 `https://`**，如 `s3.us-east-005.backblazeb2.com` |
| `S3_BUCKET` | 上传图片时 | B2 桶名 |
| `S3_REGION` | 上传图片时 | B2 区域，如 `us-east-005` |
| `S3_ACCESS_KEY_ID` | 上传图片时 | B2 的 keyID |
| `S3_SECRET_ACCESS_KEY` | 上传图片时 | B2 的 applicationKey |
| `S3_PUBLIC_URL` | 上传图片时 | B2 Proxy 地址，**带 `https://`**，如 `https://b2.yourdomain.com` |

> **三个最容易填错的点**：
> 1. `DATABASE_URL` 必须去掉 `&channel_binding=require`。
> 2. `S3_ENDPOINT` 不带 `https://`。
> 3. `S3_PUBLIC_URL` 带 `https://`。
>
> 只搭纯文字论坛、不上传图片的话，只需配置 `DATABASE_URL` 和 `JWT_SECRET`。

### 4. 部署

```bash
npm install
npx opennextjs-cloudflare build --dangerouslyUseUnsupportedNextVersion
npx opennextjs-cloudflare deploy
```

或者如果 `package.json` 里有 `deploy` 脚本：

```bash
npm run deploy
```

### 5. 绑定自定义域名

在 `wrangler.jsonc` 里加：

```jsonc
"routes": [
  {
    "pattern": "your-domain.com",
    "zone_name": "your-domain.com",
    "custom_domain": true
  }
]
```

然后重新部署。

## 📋 变量说明

### DATABASE_URL

Neon 连接串，格式：

```
postgresql://user:password@host/dbname?sslmode=require
```

**必须去掉 `&channel_binding=require`**，否则 Neon HTTP 驱动会报错。

### S3 变量

| 变量 | 示例 | 注意 |
|:---|:---|:---|
| `S3_ENDPOINT` | `s3.us-east-005.backblazeb2.com` | 不带 `https://` |
| `S3_BUCKET` | `bctzldata` | 桶名，不是 Key 的名字 |
| `S3_REGION` | `us-east-005` | 和 endpoint 里的 region 一致 |
| `S3_ACCESS_KEY_ID` | `005e9769...` | B2 的 keyID |
| `S3_SECRET_ACCESS_KEY` | `K005hiy...` | B2 的 applicationKey |
| `S3_PUBLIC_URL` | `https://b2.yourdomain.com` | 带 `https://`，末尾不加斜杠 |

## 🔧 常见问题

### 上传图片报 `NoSuchBucket`

`S3_BUCKET` 填错了。注意区分 **B2 的 Key 名字**和 **桶的名字**，两者不一样。

### 上传图片报 `B2 PUT failed 403`

`S3_REGION` 和 endpoint 里的 region 不一致，或者 `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` 填错了。

### 图片 URL 是 `s3.xxx.backblazeb2.com/...` 而不是你的域名

`S3_PUBLIC_URL` 没有生效。检查它是否配了、是否带 `https://`。

### `pool.connect is not a function`

本 fork 已经修掉了 `pool.connect` 的问题。如果你看到这个错误，说明你用的是上游原版代码，请切到本 fork。

### `Worker's code had hung`

本 fork 已经用 Neon HTTP 驱动替换了 `pg.Pool`，不会再有这个问题。如果你看到这个错误，说明 `DATABASE_URL` 格式不对（可能还带着 `channel_binding`）。

### 构建时报 `Expected "," in JSON`

`package.json` 里改了 `scripts` 后，逗号位置不对。检查 `scripts` 段，确保 JSON 语法正确。

## 已知限制
自定义 CSS 和自定义 HTML 页面功能，原版依赖本地文件系统（uploads/），在 Cloudflare Workers 上不可用。如需使用，需要把存储层改为数据库或 B2。
## 📚 技术栈

- Next.js 16 (App Router) + React 19
- Cloudflare Workers + OpenNext
- Neon PostgreSQL（HTTP 驱动）
- Backblaze B2 + B2 Proxy（S3 兼容）

## 📄 协议

与上游一致，详见 [LICENSE](LICENSE)。
