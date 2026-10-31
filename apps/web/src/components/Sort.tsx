import { groupMoments } from "@u-cut/classify";
import type { MediaItem } from "@u-cut/schema";
import { useMemo, useState } from "react";
import { type Catalog, thumbUrl } from "../api";

interface Props {
  catalog: Catalog;
  items: MediaItem[];
  excluded: string[];
  onExcluded(excluded: string[]): void;
  onScene(item: MediaItem, scene: string): void;
  onClose(): void;
}

type View = "scenes" | "moments";

const sceneOf = (item: MediaItem) => item.labels[0]?.id ?? "other";
const dragType = "application/x-ucut-media";

function momentName(items: MediaItem[]): string {
  const stamp = items.find((item) => item.takenAt)?.takenAt;
  if (!stamp) return "No date";
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(stamp));
}

/** A contact sheet: every photo, grouped by what's in it, ready to be fixed in one move. */
export function Sort({ catalog, items, excluded, onExcluded, onScene, onClose }: Props) {
  const [view, setView] = useState<View>("scenes");
  const [menu, setMenu] = useState<string | null>(null);
  const [target, setTarget] = useState<string | null>(null);
  const names = useMemo(
    () => new Map(catalog.scenes.map((scene) => [scene.id, scene.label])),
    [catalog.scenes],
  );

  const scenes = useMemo(() => {
    const groups = new Map<string, MediaItem[]>();
    for (const item of items) {
      const scene = sceneOf(item);
      groups.set(scene, [...(groups.get(scene) ?? []), item]);
    }
    return [...groups.entries()].sort(
      (a, b) => Number(a[0] === "other") - Number(b[0] === "other") || b[1].length - a[1].length,
    );
  }, [items]);

  const moments = useMemo(() => {
    const groups = new Map<string, MediaItem[]>();
    for (const item of groupMoments(items)) {
      const moment = item.moment ?? "";
      groups.set(moment, [...(groups.get(moment) ?? []), item]);
    }
    return [...groups.values()];
  }, [items]);

  const toggle = (scene: string) =>
    onExcluded(
      excluded.includes(scene) ? excluded.filter((id) => id !== scene) : [...excluded, scene],
    );

  const tile = (item: MediaItem) => {
    const scene = sceneOf(item);
    const hidden = excluded.includes(scene);
    const twin = item.quality.dupGroup !== null;
    return (
      <li key={item.id} className="print-holder">
        <button
          type="button"
          className={`print ${hidden ? "is-hidden" : ""}`}
          draggable
          aria-label={`${names.get(scene) ?? scene} ${item.kind}. Press to change its scene.`}
          aria-expanded={menu === item.id}
          onClick={() => setMenu(menu === item.id ? null : item.id)}
          onDragStart={(event) => {
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData(dragType, item.id);
          }}
        >
          <img src={thumbUrl(item.id)} alt="" loading="lazy" draggable={false} />
          {twin ? <span className="print-tag">Similar</span> : null}
          {item.kind === "video" ? <span className="print-tag">Clip</span> : null}
        </button>
        {menu === item.id ? (
          <ul className="scene-menu">
            {catalog.scenes.map((option) => (
              <li key={option.id}>
                <button
                  type="button"
                  aria-pressed={option.id === scene}
                  onClick={() => {
                    onScene(item, option.id);
                    setMenu(null);
                  }}
                >
                  {option.label}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </li>
    );
  };

  return (
    <div className="sort">
      <header className="sort-top">
        <h2>
          {items.length} {items.length === 1 ? "photo" : "photos and clips"}
        </h2>
        <fieldset className="choice sort-view">
          <legend>Group by</legend>
          <div>
            {(["scenes", "moments"] as const).map((option) => (
              <button
                type="button"
                key={option}
                aria-pressed={view === option}
                onClick={() => setView(option)}
              >
                {option === "scenes" ? "Scene" : "Moment"}
              </button>
            ))}
          </div>
        </fieldset>
        <button type="button" className="button-solid" onClick={onClose}>
          Done
        </button>
      </header>

      {catalog.sorting ? null : (
        <p className="sort-note">
          Sorting by scene needs a Mac with U-Cut's photo helper. Your moments still work here.
        </p>
      )}

      <div className="sort-body">
        <nav className="scene-list" aria-label="Scenes in this reel">
          <p>Tap a scene to leave it out. Drag a photo onto a scene to fix it.</p>
          <ul>
            {scenes.map(([scene, members]) => (
              <li key={scene}>
                <button
                  type="button"
                  aria-pressed={!excluded.includes(scene)}
                  className={target === scene ? "is-target" : ""}
                  onClick={() => toggle(scene)}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setTarget(scene);
                  }}
                  onDragLeave={() => setTarget(null)}
                  onDrop={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    setTarget(null);
                    const item = items.find(
                      (candidate) => candidate.id === event.dataTransfer.getData(dragType),
                    );
                    if (item) onScene(item, scene);
                  }}
                >
                  {names.get(scene) ?? scene} <span>{members.length}</span>
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <div className="sheet-grid">
          {view === "scenes"
            ? scenes.map(([scene, members]) => (
                <section key={scene} className={excluded.includes(scene) ? "is-left-out" : ""}>
                  <h3>
                    {names.get(scene) ?? scene}
                    {excluded.includes(scene) ? " (left out)" : ""}
                  </h3>
                  <ul>{members.map(tile)}</ul>
                </section>
              ))
            : moments.map((members) => (
                <section key={members[0]?.moment ?? "none"}>
                  <h3>{momentName(members)}</h3>
                  <ul>{members.map(tile)}</ul>
                </section>
              ))}
        </div>
      </div>
    </div>
  );
}
