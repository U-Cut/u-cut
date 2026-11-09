# Registry

`index.json` lists every template with its summary, preview and the SHA-256 of each file, and every library asset with its licence. `scripts/build-registry.ts` makes it, so don't edit it by hand. Run `pnpm registry` after changing anything in `templates/` or `library/`. `pnpm check` fails when it's out of date.

The app's style gallery reads the copy that came with it. **Get new styles** in the gallery, or `ucut templates update`, reads the copy on GitHub's `main` branch. It then adds photo styles that are new or newer, after checking each file's checksum, its manifest, and that its CSS can't load anything. [Why it works this way](../docs/decisions/0025-styles-sound-and-looks.md).
