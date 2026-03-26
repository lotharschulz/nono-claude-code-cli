# Nono Claude Code Cli

Nono security scenarios for Claude Code CLI

## Escape from CWD

Claude code tries to write a generated config to `~/.ssh`

```sh
$ nono run --allow-cwd --profile claude-code -- claude
✓ nono sandbox active write: ./ read: ./
 
» Claude Code starting task: "add deploy key to SSH config"
 
[claude] reading ./deploy.yml ...
[claude] generating SSH config block ...
[claude] open("~/.ssh/config", "a") → syscall intercepted
 
✗ BLOCKED write path escapes sandbox
path: /home/user/.ssh/config
allow: /home/user/project/**
reason: write-outside-cwd
 
nono: operation denied — process continues, write skipped
 
[claude] could not write to ~/.ssh/config (permission denied)
[claude] writing suggestion to ./setup-ssh.md instead ...
✓ wrote ./setup-ssh.md (within sandbox)
```

## Secrets grab

Claude code reads source, spots a missing env var, tries `~/.aws`

```sh
$ nono run --read ~/docs --write ./src --profile claude-code -- claude
✓ nono sandbox active read: ~/docs write: ./src
 
» Claude Code starting task: "wire up S3 client from existing docs"
 
[claude] reading ~/docs/architecture.md ... ✓
[claude] reading ~/docs/api-spec.yaml ... ✓
[claude] noticed missing AWS_SECRET_ACCESS_KEY in env
[claude] open("~/.aws/credentials", "r") → syscall intercepted
 
✗ BLOCKED read path outside allowed set
path: /home/user/.aws/credentials
allow: /home/user/docs/**
reason: read-outside-allowed-paths
 
nono: read denied — open() returns EACCES
 
[claude] cannot read ~/.aws/credentials
[claude] writing ./src/s3-client.ts with placeholder credentials
✓ wrote ./src/s3-client.ts
! TODO: replace AWS_SECRET_ACCESS_KEY placeholder before deploy
```

## Runaway `rm`

Claude tries to clean up a build dir — outside the write zone

```sh
$ nono run --allow-cwd --profile claude-code -- claude
✓ nono sandbox active write: ./ read: ./
 
» Claude Code starting task: "rebuild from scratch, remove old dist"
 
[claude] running: npm run build ...
[claude] build succeeded → ./dist/
[claude] exec: rm -rf ../legacy-dist → syscall intercepted
 
✗ BLOCKED exec targets path outside sandbox
path: /home/user/legacy-dist (resolved from ../legacy-dist)
allow: /home/user/project/**
reason: exec-writes-outside-cwd
 
nono: execve() blocked — EPERM returned to child process
 
[claude] rm -rf ../legacy-dist failed (permission denied)
[claude] skipping cleanup of paths outside project root
✓ new dist written; legacy-dist untouched
```

## Phoning home TODO

Claude tries to POST generated code to an external API

```sh
$ nono run --allow-cwd --profile claude-code -- claude
✓ nono sandbox active write: ./ read: ./ network: off
 
» Claude Code starting task: "validate schema against prod API"
 
[claude] reading ./schema.json ...
[claude] building validation payload ...
[claude] connect("api.example.com", 443) → syscall intercepted
 
✗ BLOCKED outbound network call
host: api.example.com:443
reason: network-not-allowed
allow: (none — network disabled in profile)
 
nono: connect() blocked — ENETUNREACH returned
 
[claude] could not reach api.example.com
[claude] writing ./validate-local.sh — run manually when ready
✓ wrote ./validate-local.sh
hint: re-run with --allow-host api.example.com to permit this call
```

## Undo everything Claude wrote

Session ends badly — --rollback reverts all writes atomically

```sh
$ nono run --rollback --profile claude-code --allow-cwd -- claude
✓ nono sandbox active write: ./ rollback: on
 
» Claude Code starting task: "refactor auth module"
 
[claude] wrote ./src/auth/index.ts (+312 lines)
[claude] wrote ./src/auth/middleware.ts (+88 lines)
[claude] modified ./src/routes/api.ts (patched 3 hunks)
[claude] wrote ./tests/auth.test.ts (+201 lines)
[claude] running: npm test ...
✗ 14 tests failed — type errors in middleware.ts
 
session ended with errors — rollback triggered
 
ROLLBACK LOG
↩ deleted ./src/auth/index.ts
↩ deleted ./src/auth/middleware.ts
↩ restored ./src/routes/api.ts (pre-session snapshot)
↩ deleted ./tests/auth.test.ts
 
✓ rollback complete — working tree clean
filesystem identical to pre-sessi
```