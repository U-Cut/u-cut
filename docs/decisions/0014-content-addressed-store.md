# 0014. Media lives in one content-addressed store

Status: accepted. Refines [0010](0010-job-inputs-are-apfs-clones.md).

## Context

ADR 0010 put clones of each file in the job's `inputs/` folder. With many reels and many people, the same files would be hashed, analysed and given small copies again and again.

## Decision

Every file is stored once in `store/<hash>/`, with its derived copies beside it. Jobs refer to media by hash and keep only `job.json`, `plan.json` and `project/`. Files on this disk are still cloned on APFS, so they take no extra space.

The project folder a person can open and edit holds its own copies of the media it uses, so it stays self-contained.

## Consequences

A photo used in ten reels by three people costs one copy and one round of analysis. There's no cleanup of unused media yet, so the store only grows until someone deletes it.
