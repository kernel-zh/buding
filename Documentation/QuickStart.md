# 快速开始

本指南用于把布丁部署到一个全新的 Supabase、GitHub Actions 和 Vercel
组合中。完成后，GitHub Actions 每 30 分钟同步数据，Vercel 只负责提供
网站和 API Key 认证。

## 1. 创建 Supabase 项目并建表

在 Supabase 创建一个新项目，打开 **SQL Editor**，执行
`supabase/schema.sql` 的完整内容。它会一次性创建公开只读的补丁数据表、API
Key、人工状态覆盖和审计表。

如果数据库不是全新的，不要执行 `schema.sql`；请改为按文件名升序执行
`supabase/migrations/` 中尚未执行的 migration。

在 Supabase 的 **Connect** 页面记录下：

- Project URL，例如 `https://example.supabase.co`
- Publishable key（`sb_publishable_...`）
- Secret key（`sb_secret_...`）

Publishable key 可以用于浏览器读取；Secret key 绝不能公开，也不能写入任何
`NEXT_PUBLIC_*` 变量。

## 2. 设置 GitHub Actions

在仓库的 **Settings → Secrets and variables → Actions** 添加两个 Repository
secret：

```text
SUPABASE_URL=https://example.supabase.co
SUPABASE_SECRET_KEY=sb_secret_...
```

随后在 **Actions → Sync tracker data → Run workflow** 手动运行一次。首次运行
会从仓库自带的种子数据开始同步并发布到空数据库；之后工作流会自动每 30
分钟运行一次。

`BUDING_*` 认证变量不需要放进 GitHub Actions。

## 3. 部署到 Vercel

将 GitHub 仓库导入 Vercel，保持默认的 Next.js 构建设置。在 **Settings →
Environment Variables** 为 Production（建议也为 Preview）设置：

```text
NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...

SUPABASE_SECRET_KEY=sb_secret_...

BUDING_API_KEY_PEPPER=<随机私密值>
BUDING_API_SESSION_SECRET=<另一随机私密值>
BUDING_ADMIN_KEY=<管理员根 Key>
BUDING_ADMIN_PATH=/manage-keys-<长随机后缀>
```

可选地设置 Cookie 生命周期：

```text
BUDING_API_SESSION_DAYS=30
BUDING_API_SESSION_REFRESH_DAYS=7
```

刷新窗口必须小于总有效期。`SUPABASE_URL` 在 Vercel 可省略：服务端会使用
`NEXT_PUBLIC_SUPABASE_URL`；`SUPABASE_SECRET_KEY` 则必须设置，以便服务端写入
人工状态和管理 API Key。

可以用下面命令生成随机值（不要把输出提交到仓库）：

```bash
openssl rand -base64 48 # 为 PEPPER、SESSION_SECRET、ADMIN_KEY 各运行一次
openssl rand -hex 20    # 用于 BUDING_ADMIN_PATH 的随机后缀
```

保存变量后重新部署。

## 4. 创建日常 API Key

访问 `BUDING_ADMIN_PATH` 指定的完整地址，例如：

```text
https://your-site.vercel.app/manage-keys-<长随机后缀>
```

点击网站导航栏的 **API Key**，输入 `BUDING_ADMIN_KEY`。管理页面会显示 API
Key 管理器；创建一个 `operator` Key 作为日常补丁状态操作的凭证。新 Key 仅在
创建时显示一次，请立即保存到密码管理器。

`BUDING_ADMIN_KEY` 只能用于创建、编辑、撤销或删除普通 Key，不应作为日常
操作 Key 分发。普通 Key 被撤销后会立即失效，即使浏览器 Cookie 尚未到期。

## 5. 验证

确认下列事项：

1. 首页能读取补丁列表。
2. GitHub 的首次同步工作流成功。
3. 通过普通 API Key 可手动设置补丁状态。
4. 管理路径使用普通 Key 时展示 401；使用根 Key 时可管理 Key。

## 本地首次发布（可选）

如果不想等待 GitHub Action，可在已完成本地同步后发布数据：

```bash
pnpm sync
SUPABASE_URL=https://example.supabase.co SUPABASE_SECRET_KEY=sb_secret_... pnpm publish:supabase
```

这要求本地安装 `lei` 和同步所需的 Git 工具；大多数部署直接手动运行 GitHub
Action 即可。
