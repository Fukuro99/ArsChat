**English | [日本語](../skills.md)**

# Skills

Skills are **reusable AI prompt templates** defined per persona.
They use a simple Markdown file format with YAML frontmatter and can be edited in any text editor.

---

## Table of Contents

- [Overview](#overview)
- [File Structure](#file-structure)
- [Skill File Format](#skill-file-format)
- [Frontmatter Fields](#frontmatter-fields)
- [Script Integration](#script-integration)
- [Slash Commands](#slash-commands)
- [Examples](#examples)

---

## Overview

How skills work:

1. Markdown files are placed in the `skills/` directory under a persona's data folder
2. Skills are loaded at startup and their descriptions are injected into the AI's system prompt
3. The user types a slash command (e.g. `/review`) or the AI autonomously fetches skill details
4. The full skill text is passed to the AI as detailed instructions

---

## File Structure

```
%APPDATA%/ArsChat/arschat-data/
└── personas/
    └── {persona-id}/
        └── skills/
            ├── code-review.md
            ├── translate.md
            └── db-query.md
```

The filename without extension becomes the skill ID.

---

## Skill File Format

```markdown
---
name: Code Review
description: Reviews code for quality, security, and readability
trigger: /review
script:
  type: command
  value: "git diff HEAD"
---

Please review the following code from these perspectives:

## Checklist
- Security vulnerabilities (SQL injection, XSS, etc.)
- Performance issues
- Readability and naming conventions
- Missing error handling
- Test coverage

## Output Format
List issues by severity (high/medium/low) and suggest improvements.
```

---

## Frontmatter Fields

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | string | ✓ | Display name of the skill |
| `description` | string | ✓ | Short description injected into system prompt (1–2 lines) |
| `trigger` | string | — | Slash command to invoke the skill (e.g. `/review`) |
| `script.type` | string | — | Script type: `file` / `command` / `url` |
| `script.value` | string | — | Script value (path / command / URL) |

---

## Script Integration

Setting the `script` field runs an external command or reads a file when the skill is invoked.
The output is passed to the AI as additional context.

### `type: command`

Executes a shell command and uses its output.

```yaml
script:
  type: command
  value: "git diff HEAD"
```

### `type: file`

Reads a file and passes its contents to the AI.

```yaml
script:
  type: file
  value: "C:/Users/user/project/schema.sql"
```

### `type: url`

Fetches a URL and passes its contents to the AI.

```yaml
script:
  type: url
  value: "https://api.example.com/docs"
```

---

## Slash Commands

Setting `trigger: /command-name` makes the skill available as a slash command in the chat input.

```
/review Check the security of this function
/translate Translate the following text to English
```

Typing a slash command prepends the full skill text to the system prompt,
and the text after the command is sent as the user message.

---

## Examples

### Code Review Skill

```markdown
---
name: Code Review
description: Reviews code for quality, security, and readability
trigger: /review
---

Review the following code and classify issues by severity (high/medium/low):

**Security**
- Injection vulnerabilities (SQL, command, XSS)
- Authentication and authorization issues
- Hardcoded secrets

**Quality**
- Missing error handling
- Naming convention consistency
- Duplicate code (DRY principle)

**Performance**
- N+1 queries
- Unnecessary loops or recalculations
```

### Translation Skill

```markdown
---
name: English Translation
description: Translates text into natural English
trigger: /translate
---

Translate the following text into English.

- Use precise terminology for technical documentation
- Use natural expressions for casual text
- Return only the translation, no explanation
```

### Git Diff Review Skill

```markdown
---
name: Git Diff Review
description: Reviews git diff output
trigger: /diff-review
script:
  type: command
  value: "git diff HEAD"
---

Review the git diff above and check:

1. Whether the intent of the changes is clear
2. Whether any changes require tests
3. Whether there is a risk of regressions
4. What to include in the commit message
```

### DB Schema Reference Skill

```markdown
---
name: DB Schema Reference
description: Creates SQL queries with reference to the database schema
trigger: /sql
script:
  type: file
  value: "C:/Users/user/project/schema.sql"
---

Refer to the database schema above to write SQL queries for the user's request.

- Use exact table and column names
- Leverage indexes for performance
- Explain JOIN choices when relevant
```

---

## Managing Skills

You can view, create, and delete skills from the Settings panel.
You can also edit Markdown files directly in any text editor.
File changes take effect after restarting the app.
