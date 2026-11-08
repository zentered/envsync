# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with
code in this repository.

## Project Overview

EnvSync is a CLI tool that synchronizes environment variables from Google Cloud
Platform (GCP) Secrets Manager to local `.env` files. It parses `.env.example`
files, identifies variables marked with the `envsync//` prefix, fetches their
values from GCP Secrets Manager, and writes them to a `.env` file.

## Commands

### Development

- `npm run dev` - Run in development mode with file watching
- `npm start` - Run the CLI normally
- `npx envsync [file]` - Execute the tool directly (default: `.env.example`)

### Testing

- `npm test` - Run all tests using Node's native test runner with esmock
- `node --loader=esmock --test` - Direct test command

### Code Quality

- `npm run lint` - Run ESLint on JavaScript and Markdown files
- `npm run codestyle` - Format code with Prettier

### Requirements

- Node.js `^22.21.0 || >=24.10.0`. Older `util.parseEnv` parsers differ.
  Measured: Node 22.13 and 23.11 read `K="a\nb=c"` with a second, bogus key
  (`"a\nb`), read `K=x#y` as `x#y`, and read `A="x\nB=z\nC="y"` with extra keys.
  Node 22.16.0, 22.21.0 and 26.13 read these as Node 22.21 does: one `K`, `x`
  for `x#y`, and no extra keys
- A `keyfile.json` for GCP service account authentication must be present in the
  working directory
- The first variable in `.env.example` must be `GCP_PROJECT` or
  `GCLOUD_PROJECT_ID`

## Architecture

### Core Flow

1. **Entry Point** (`index.js`): CLI entry that reads the `.env.example` file
   (or custom file via argument), checks for existing `.env`, and orchestrates
   the synchronization with merge behavior
2. **Parser** (`lib/readExample.js`): Splits `.env.example` into lines,
   identifies which variables need syncing (contain `envsync//`), and extracts
   the GCP project ID
3. **Env Reader** (`lib/readEnv.js`): Parses existing `.env` files into a Map
   for merging
4. **Fetcher** (`lib/fetchVariable.js`): Connects to GCP Secrets Manager and
   retrieves secret values using the format `envsync//[secret-name]/[version]`
   (version defaults to 'latest')
5. **Merger** (in `index.js`): Merges values from `.env.example` with existing
   `.env`, preserving keys not in the example
6. **Writer** (`lib/joinEnv.js`): Reconstructs the environment file format from
   key-value pairs

### Variable Syntax

Variables that should be fetched from GCP Secrets Manager use this format:

```
VARIABLE_NAME=envsync//secret-name/version
```

The `secret-name` maps to a secret in GCP Secrets Manager, and `version` is
optional (defaults to 'latest').

### Testing Strategy

Tests use `esmock` for mocking ES modules. The test suite includes:

- Unit tests for each core function
- Integration-style test for the full read-parse-fetch-join flow
- Mock implementations of the GCP Secrets Manager client

### Key Design Decisions

- **Merge Behavior**: The tool performs intelligent merging instead of
  overwriting:
  - Keys from `.env.example` override/update existing keys in `.env`
  - Keys in existing `.env` that aren't in `.env.example` are preserved
  - Order: keys from `.env.example` appear first, followed by preserved keys
  - If no `.env` exists, creates a new file (original behavior)
  - Uses Set-based lookup for O(n) performance when checking for duplicate keys
- The GCP project ID is parsed from the first `GCP_PROJECT` or
  `GCLOUD_PROJECT_ID` variable in the file
- Empty lines in `.env.example` are preserved in the output
- The tool uses Node's native fs/promises API for file operations
- Splitting on `=` uses a regex `/=(.*)/s` to only split on the first `=`,
  preserving `=` in values
- `lib/readEnv.js` parses `.env` content with Node's `util.parseEnv`, the parser
  behind `node --env-file`. Quotes, comments and multi-line values read exactly
  as Node reads them
- `lib/joinEnv.js` writes a `.env` that Node reads back exactly and that is safe
  to source in a shell. A value is bare only when every character is in
  `[A-Za-z0-9_@%+=:,./?*[\]^-]` (or it is empty). For an `export` key only
  `[A-Za-z0-9_@%+=:,./-]` is bare, because a shell expands braces and globs in
  `export` arguments. A value that starts with `=` or contains `:=` is never
  bare, because zsh expands it (`K==ls` becomes `/bin/ls`). A test sources the
  output in sh, bash, dash and zsh, when installed, and checks that nothing runs
  and every value is exact. Otherwise it is single-quoted, with raw newlines for
  multi-line values. A value with a `'` and none of `"`, `\`, `$` or a backtick
  is double-quoted instead. Comment entries from `.env.example` are written as
  they are. Every written value must also pass a whole-file `util.parseEnv`
  check. Refused values throw an error naming the key:
  - CR (Node drops it)
  - `'` together with `"`, `\`, `$` or a backtick (no form is both exact for
    Node and inert in a shell; backtick quotes are not used because they allow
    command substitution)

  An existing value of that kind is refused on every sync until it is edited by
  hand. Values outside the bare set are single-quoted. Node and dotenv strip the
  quotes, other `--env-file` readers (for example docker) may not. Dotenv
  compatibility is not verified

- Whitespace is only trimmed from the beginning/end of keys and values,
  preserving internal spaces
- The `GCP_PROJECT` variable must appear **before** any `envsync//` variables,
  otherwise an error is thrown
- All secrets are fetched concurrently using `Promise.all()` for performance
- Error handling distinguishes between expected errors (file not found) and
  unexpected errors (permissions, corruption)

### Development Notes

- This project uses ESLint 10.x with flat config (`eslint.config.js`)
