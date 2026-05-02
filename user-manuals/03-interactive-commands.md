# 03. Interactive Commands

You can directly command the brain by using specific prefixes in Slack or through your AI assistant.

## ✅ Task Lifecycle
Tasks follow a formal lifecycle. You can move tasks between stages by prefixing:
- **`done: <task>`** — Mark as **completed**.
- **`doing: <task>`** — Mark as **in_progress**.
- **`block: <task>`** — Mark as **blocked**.
- **`defer: <task>`** — Mark as **deferred**.

*Example:* `block: finalize UI design`
*Effect:* The system searches for the task "finalize UI design" and moves it to the `blocked` status.

## 🎯 Setting Goals & Principles
To establish your strategic foundation, use the following commands. These configure the "Mentor" persona.

> **`goal: <high-level target>`**
> *Example:* `goal: Ship the Open Brain v2 architecture by end of April`

> **`principle: <operating rule>`**
> *Example:* `principle: Always favor Infrastructure-as-Code (IaC)`

Once you set these, every future thought is evaluated against your goals and principles.

## 🎨 Personal Taste Preferences
You can create strict guardrails for the Mentor persona. This is very useful for blocking or encouraging specific patterns.

> **`pref: <explicit rule>`**
> *Example:* `pref: I want to focus on deep-work coding; reject meetings without an agenda.`

*Effect:* Stored as a "WANT" and "REJECT" rule. Future thoughts violating this (like casually mentioning attending an agenda-less meeting) will trigger a Slack warning and strategic pushback from the mentor.
