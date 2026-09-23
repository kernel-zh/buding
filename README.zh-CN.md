# 布丁 Buding

[English](./README.md) | 中文

布丁用于追踪修改以下目录的 Linux 文档补丁系列：

- `Documentation/translations/zh_CN/`
- `Documentation/translations/zh_TW/`

本系统从公开的 [`linux-doc` 邮件归档](https://lore.kernel.org/linux-doc/)
中还原补丁系列，追踪补丁在维护者 Git 树中的进展，并为维护者提供一个管理补丁系列状态的面板。

网址：

- https://buding.wyuan.org (Cloudflare)
- https://buding.anka2.top (腾讯云边缘安全加速)

## 主要功能

- 从 lore 还原补丁系列、版本、回复和评审标签。
- 使用稳定 patch ID 对比 Alex 的 `docs-next`、Corbet 的 `docs-mw` 和
  Linus 的 `master`。
- 为当前版本的补丁系列提供集中的评审队列。
- 维护者可以使用 API Key 手动选择全部六种状态。Key 可立即撤销，原始
  Key 不会存入 Supabase。

## 补丁状态

| 状态 | 含义 |
| --- | --- |
| **Proposed（已提议）** | 当前系列正在等待维护者决定。新发现的系列默认自动设为此状态。 |
| **Needs revision（需要修改）** | 维护者要求修改，并期待作者提交新版本。 |
| **Superseded（已被取代）** | 该系列已有更新版本。旧版本会自动设为此状态。 |
| **Approved（已批准）** | 维护者已经接受该系列，但它可能尚未出现在被追踪的 Git 树中。 |
| **Rejected（已拒绝）** | 维护者决定不接受该系列。 |
| **Applied（已应用）** | 全部补丁已在至少一棵被追踪的 Git 树中找到精确证据；找到证据后会自动设为此状态。 |

不存在人工覆盖记录时，系统继续使用默认的自动状态规则。有权限的维护者可以
手动选择任意状态；无论人工状态为何，上游证据都会独立显示。

## 项目架构

1. 定时 GitHub Action 使用 `lei` 读取 `linux-doc` 邮件，并索引三棵 Git 树。
2. 数据流水线整理补丁版本、匹配 Git 提交、校验结果，并发布到 Supabase。
3. Next.js 应用在请求时读取 Supabase；经过认证的 API 请求负责保存维护者
   选择的状态及审计记录。

仓库中的 `data/` 目录只用于种子数据和测试。部署及环境变量配置请见
[Documentation/QuickStart.md](./Documentation/QuickStart.md)。

## 贡献

欢迎任何形式的贡献，您可以将相关问题或补丁发送至 linux-doc@vger.kernel.org，
并抄送 `Weijie Yuan <wy@wyuan.org>` 与 `Siwei Chen <me@birdanka.com>`；
或在 GitHub 上提交问题和拉取请求。

## 致谢

本项目的用户界面设计改编自
[Sashiko](https://github.com/sashiko-dev/sashiko)：

> Copyright The Linux Foundation and its contributors. All rights reserved.

Sashiko 采用 [Apache License 2.0](./LICENSES/Apache-2.0.txt) 许可；完整归属说明见
[THIRD_PARTY_NOTICES](./THIRD_PARTY_NOTICES)。

同时感谢 [SourceHut](https://sourcehut.org/)。

## 许可证

[GNU Affero 通用公共许可证第 3 版](./COPYING)
