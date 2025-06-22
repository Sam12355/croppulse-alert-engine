# Working in this repository with an AI agent

Read [AGENTS.md](AGENTS.md) first: it holds the setup, the boundaries and the
repository-specific rules, and it applies to every agent rather than one vendor.

This file adds the Claude Code specifics.

## Context worth loading first

- `README.md` for what the reliability logic is for and what it deliberately excludes
- `ARCHITECTURE.md` for why the transport and persistence are not here
- `docs/ai/SECURITY_RULES.md` for the hard rules

## The trap in this repository

Generated code here is usually locally sensible and wrong in relation to something else.
Every real bug found across this portfolio was of that shape: a value that looked correct
in the function being written and broke a branch fifteen lines away.

Before finishing, ask what would make the change wrong, and whether anything currently
checks that. Compiling is evidence the syntax is valid and nothing else.

## After writing code

```bash
pnpm lint && pnpm typecheck && pnpm test
```

Paste the real output rather than describing what you expect it to print.
