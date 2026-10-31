# 0010. Job inputs are APFS clones

Status: accepted

## Context

The brief offers two options: copy media into the job folder, or keep security-scoped bookmarks. Bookmarks exist for sandboxed apps. U-Cut can't be sandboxed in practice, because it spawns Node, FFmpeg and Chrome. A trip's worth of phone media can run to tens of gigabytes, and real Macs are short of space.

## Decision

Ingest copies with `fs.copyFile(..., COPYFILE_FICLONE)`. On APFS this makes a clone that takes no extra space until a file changes, and it falls back to a real copy across volumes. Each file is hashed once, and the hash becomes the `MediaItem.id`.

## Consequences

Jobs stay self-contained and reproducible even if the originals move. Before a cross-volume copy, ingest checks free space and stops with a plain sentence if it won't fit.
