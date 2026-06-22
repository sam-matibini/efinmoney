# CLAUDE.md

## Core principle
Move fast by staying narrowly scoped; stay correct by changing as little as possible.
Most wasted time comes from reading too much, building too much, or testing too much. Don't.

## Engineering judgment (apply to every change)
- **Pick the right approach before writing code.** Choose the data structure that fits the
  access pattern: a map/set for lookups and deduplication, an array for ordered iteration,
  a queue/stack when processing order matters. The right choice here prevents most
  performance and correctness bugs downstream.
- **Match the codebase.** Reuse existing patterns, naming, and utilities. Don't introduce a
  new library, abstraction, or architecture unless the task genuinely can't be done without it.
- **Prefer the simplest solution that fully works.** No speculative generality, no
  "future-proofing," no cleverness for its own sake.

## Bug fixes
1. **Reproduce first.** Run the specific failing test/command and read the actual
   error/stack trace before changing anything.
2. **Trace to the root cause.** Fix the cause, not the symptom.
3. **Apply the smallest change** that resolves it. Touch only the files involved —
   no refactors or unrelated cleanup.

## Features
1. **Restate the feature in one line** so we agree on what "done" means. If scope is
   unclear, ask one question before coding.
2. **Build the smallest version** that fully satisfies the request, following existing patterns.
3. **Cover it** — add or update the relevant test(s) for the new behavior.

## Verify before pushing (both paths)
- Re-run the relevant test/command until it passes.
- Run the project's lint and build/typecheck steps if they exist.
- Do **not** run the full test suite — CI handles that.
- If a check fails, fix it before pushing. **Never push red.**

## Commit & push
- One focused commit with a concise message: `fix: <what>` or `feat: <what>`.
- Push to main. Done after push — don't babysit CI unless I ask.

## Speed rules
- Don't read the whole codebase. Start from the error or the feature's entry point and
  follow only what's relevant.
- Detect the project's own commands (package.json, Makefile, CI config) — don't assume them.
- Don't ask me to confirm each step. Complete the loop on your own.

## When to stop and ask
If you're blocked, the fix is ambiguous, or a change would touch many files or alter shared
behavior, stop and ask **one** specific question instead of guessing or exploring broadly.
