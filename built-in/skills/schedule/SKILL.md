---
name: schedule
description: "Use this skill when the user wants to run a task automatically on a schedule, or turn the current request into a recurring/scheduled job. Triggers include: 'every day', 'each morning', 'every weekday', 'weekly on Monday', 'at 9am', 'run this on a schedule', 'remind me to…', 'do X automatically', or any request to repeat work on a cadence. Do NOT use for one-off work the user wants done right now."
---

# Create a scheduled task

Turn a request into a scheduled task that re-runs on a cadence using the
`create_scheduled_task` tool (`mcp__agent_studio__create_scheduled_task`).

## When to use

The user wants something to run automatically and repeatedly — e.g. "summarize
my inbox every morning at 9", "every weekday post a standup", "weekly on Monday
review open PRs". Also use it to convert the current conversation's task into a
recurring one.

## How to use

1. **Settle the cadence.** Map the user's words to a `frequency`:
   - `daily` — once a day (needs `time_of_day`)
   - `weekdays` — Mon–Fri (needs `time_of_day`)
   - `weekly` — once a week (needs `time_of_day` and `weekday`, 0=Sun … 6=Sat)
   - `hourly` — every hour
   - `manual` — only when the user triggers it by hand
   If the time or day is ambiguous, ask one short question before creating.
2. **Write a clear `prompt`.** This is the instruction the agent will run on
   every fire, with no further user input — make it self-contained.
3. **Give it a short `name`** (and optionally a one-line `description`).
4. **Call `create_scheduled_task`.** The task automatically inherits this
   conversation's working directory and model — do not ask for those.

## After creating

Confirm to the user what was scheduled and when the next run will be. The task
appears in the Scheduled section of the sidebar.

## Notes

- Times are local, 24-hour `HH:MM` (e.g. `09:00`, `14:30`).
- For `weekly`, always include both `time_of_day` and `weekday`.
- Don't use this skill to do the work itself — only to schedule it.
