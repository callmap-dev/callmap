# The audit repos and the field repos

This folder lists the repos of the audit gate and of the 5 repos gate of ADR-0042. Each file is a list file of the field run command, for one language:

- `typescript.json` for `callmap-ts`
- `go.json` for `callmap-go`
- `ruby.json` for `callmap-rb`

Each list holds 5 open-source repos. Each entry holds the URL of the repo, the branch commit and the base commit. The first entry of each list is the audit repo of its language. The audit runs on the reader page of that entry, and the run times gate takes its times from that entry. The other 4 repos have other layouts, so that the 5 repos gate tests more than one shape of a repo. `docs/checks.md` tells how to run each gate with these lists.

## The commits

The branch commit of each audit repo is the commit of the earlier research on that repo. So the audit sheet and the field record can be compared with these records:

- `apache/echarts` at `34f4d927`, as in `docs/research/2026-10-19-levels-on-a-large-codebase/`.
- `go-gitea/gitea` at `85211296`, as in `docs/research/2026-10-26-go-resolution-on-gitea/`.
- `mastodon/mastodon` at `7be1842a`, as in `docs/research/2026-10-30-ruby-type-flow-on-mastodon/`.

The branch commit of each other repo is the tip of its default branch on 2026-11-26.

The base commit of a repo is the 20th commit before the branch commit on the line of first parents. So each review holds the changes of 20 merges, and each range changes at least 4 source files outside the tests. 3 audit repos take another base:

- `apache/echarts` takes `b014e953`, the base of the levels research. With the 20th commit back, the range holds the merge of a release branch, `b014e953` itself, which changes 280 TypeScript files.
- `go-gitea/gitea` takes the 5th commit back, `ff68b39c`. The 6th commit back, `8abda62`, moves the Go tests and changes 388 Go files.
- `mastodon/mastodon` takes the 30th commit back, `ec8bab69`. The 20 commits before the branch commit change only 3 Ruby files.

## The reasons for each repo

The owner confirms the 12 repos that are not audit repos in the review of the pull request.

### TypeScript

1. `apache/echarts`: the audit repo of ADR-0042. It is one large package of TypeScript with classes and deep inheritance.
2. `vitejs/vite`: a pnpm workspace with many packages, where one package imports another by its package name. It tests ADR-0041, the workspace package that resolves to its source.
3. `nestjs/nest`: an npm workspace with Lerna, decorators and dependency injection. Many calls go through an interface or an abstract class, so it tests the one-of groups.
4. `excalidraw/excalidraw`: a Yarn workspace of a React app and its packages, mostly in `.tsx` files. It tests the calls in components and in hooks.
5. `honojs/hono`: one library in `src/` with many small modules that each runtime imports by a subpath. It tests a small repo, and gives the run times of a small repo beside those of the audit repo.

### Go

1. `go-gitea/gitea`: the audit repo of ADR-0042. It is one large module of an app.
2. `etcd-io/etcd`: a `go.work` at the repo root, with 14 modules on its use lines. It tests the load of a workspace.
3. `hashicorp/consul`: many `go.mod` files and no `go.work`. The root module points at `api`, `sdk` and other modules with replace lines. It tests the load of each module on its own.
4. `caddyserver/caddy`: one module with modules of the app that plug in through interfaces. It tests the one-of groups and the calls through an interface.
5. `spf13/cobra`: one small library module with no dependency of note. It tests a small repo, and gives the run times of a small repo beside those of the audit repo.

### Ruby

1. `mastodon/mastodon`: the audit repo of ADR-0042. It is one large Rails app.
2. `rubocop/rubocop`: a large gem with no Rails. It has many classes of one shape, the cops, and many modules that the classes include.
3. `sinatra/sinatra`: 3 gems in one repo: `sinatra`, `rack-protection` and `sinatra-contrib`. It tests a repo of several gems with no Rails.
4. `heartcombo/devise`: a Rails engine in a gem, with `app/` and `lib/`. It tests the Rails rules outside a Rails app.
5. `jekyll/jekyll`: a command-line gem with no Rails, with plugins and Liquid tags. It tests the calls of a program that registers its parts at run time.
