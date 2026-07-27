# Codex Project Notes

## Working principle

- These notes are reliability guardrails, not restrictions on architecture, coding style, tools, or implementation strategy.
- Always choose the best technical approach for the task. Vite, development servers, subprocesses, browser automation, and alternative workflows are all allowed when their lifecycle is controlled.
- Do not compromise the quality of the implementation merely to follow a previously used workflow.

## Avoiding stalled processes on Windows

- Do not leave a command waiting indefinitely for a persistent process such as a development server.
- Before starting a server, check whether a healthy instance already exists on the intended port and reuse it when appropriate.
- Choose a lifecycle mechanism suitable for the current execution environment: a managed runtime, a dedicated service tool, a separate user terminal, or another verified background-process method.
- Give server startup a short, bounded window and perform a health check. If the controlling command does not return promptly, cancel it and switch approaches.
- Be aware that this Codex Windows environment may retain detached descendants inside a Job Object. Methods such as foreground `npm run dev`, `cmd start /b`, `detached`, or `unref()` may therefore behave differently than in a normal terminal. They are not forbidden, but they must be verified rather than assumed to detach.
- `Start-Process` may fail when both `Path` and `PATH` are present. If that specific error occurs, change methods instead of retrying the same command.
- Keep waits bounded and provide the user a status update within 60 seconds during ongoing work.
- Track exact PIDs for temporary helper processes and stop only those during cleanup. Never terminate every `node.exe` process.
