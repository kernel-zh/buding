# Buding

English | [中文](./README.zh-CN.md)

Buding is a tracker for Linux documentation patch series that modify:

- `Documentation/translations/zh_CN/`
- `Documentation/translations/zh_TW/`

It reconstructs series from the public [`linux-doc` archive](https://lore.kernel.org/linux-doc/),
follows their progress through the maintainer trees, and gives maintainers
a dashboard for managing patch series statuses.

Website:

- https://buding.wyuan.org (Cloudflare)
- https://buding.anka2.top (Tencent Cloud EdgeOne)

## Features

- Reconstruct patch series, revisions, replies, and review trailers from lore.
- Compare patches with Alex's `docs-next`, Corbet's `docs-mw`, and Linus's
  `master` using stable patch IDs.
- Provide a focused review queue for current series.
- Let maintainers use an API key to select any of the six patch statuses. Keys
  can be revoked immediately, and raw keys are not stored in Supabase.

## Patch statuses

| Status | Meaning |
| --- | --- |
| **Proposed** | The current series is awaiting a maintainer decision. This is the automatic default for a newly discovered series. |
| **Needs revision** | A maintainer has requested changes and expects a new revision. |
| **Superseded** | A newer revision of the series exists. Older revisions receive this status automatically. |
| **Approved** | A maintainer has accepted the series, but it may not have appeared in a tracked Git tree yet. |
| **Rejected** | A maintainer has decided that the series should not be accepted. |
| **Applied** | Every patch has exact Git evidence in at least one tracked tree. This status is assigned automatically when such evidence is found. |

Automatic status rules remain the default when no manual override exists. An
authenticated maintainer may select any status manually; upstream evidence is
still displayed independently of that selection.

## Architecture

1. A scheduled GitHub Action reads `linux-doc` mail with `lei` and indexes the
   three tracked Git trees.
2. The reconciliation pipeline groups revisions, matches patches, validates
   the result, and publishes it to Supabase.
3. The Next.js application reads Supabase at request time. Authenticated API
   requests store maintainer-selected status overrides and their audit events.

The checked-in `data/` directory is used only for seeds and tests. Deployment
and environment setup are documented in
[Documentation/QuickStart.md](./Documentation/QuickStart.md).

## Contributing

Contributions of any form are welcome. You can send relevant issues or patches
to linux-doc@vger.kernel.org, and Cc `Weijie Yuan <wy@wyuan.org>` & `Siwei Chen <me@birdanka.com>`;
or open issues and pull requests on GitHub.

## Acknowledgements

The user interface design is adapted from
[Sashiko](https://github.com/sashiko-dev/sashiko):

> Copyright The Linux Foundation and its contributors. All rights reserved.

Sashiko is licensed under the
[Apache License 2.0](./LICENSES/Apache-2.0.txt). See
[THIRD_PARTY_NOTICES](./THIRD_PARTY_NOTICES) for the complete attribution.

Thanks also to [SourceHut](https://sourcehut.org/).

## License

[GNU Affero General Public License, version 3](./COPYING)
