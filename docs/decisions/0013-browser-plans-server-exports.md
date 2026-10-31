# 0013. The browser plans, the server exports

Status: accepted. Extends the brief, which says "one render at a time".

## Context

The owner asked for good latency with 20 people at once. Twenty people on twenty Macs share nothing, so the hard case is many people sharing one machine through `ucut serve --lan`. That machine can't render 20 reels at once, and a local-first tool has no server farm.

## Decision

- Split work by how fast it must feel. The planner, composer and player run in the browser. The server only does what a browser can't: reading media and rendering.
- Keep the planner and composer free of Node dependencies, so the same code runs in both places.
- Run exports through a bounded scheduler with start-time fair queuing. Analysis gets its own pool, so a queue of exports can't delay a new upload.
- Run heavy work as low-priority child processes.
- Cache by content at every layer, and share one run between identical requests.
- Adapt workers to load: all of them for one person, shared across slots under a queue.

Plain round-robin was tried first. Tests showed it served someone with a running export before someone with none, so it was replaced.

## Consequences

Measured on an 8 GB Mac with 20 simulated people: interface requests stayed at 1 ms median and 13 ms at p95 during exports, with no failures. Exports still wait in line, since a queue shares capacity but can't create it. [The architecture guide](../ARCHITECTURE.md#what-20-people-get) has the full numbers.
