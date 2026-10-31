import type { EditPlan, MediaItem } from "@u-cut/schema";
import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef } from "react";
import type { Catalog } from "../api";
import { compositionFor } from "../reel";
import { ReelPlayer } from "../stage/player";

export interface StageHandle {
  toggle(): void;
  seek(time: number): void;
  setMuted(muted: boolean): void;
  time(): number;
}

interface Props {
  catalog: Catalog;
  items: MediaItem[];
  plan: EditPlan;
  autoplay?: boolean;
  muted?: boolean;
  onTime?: (time: number) => void;
  onPlayingChange?: (playing: boolean) => void;
}

const sizes = { "9:16": 9 / 16, "1:1": 1, "16:9": 16 / 9 };

export const Stage = forwardRef<StageHandle, Props>(function Stage(
  { catalog, items, plan, autoplay = true, muted = false, onTime, onPlayingChange },
  ref,
) {
  const frame = useRef<HTMLDivElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const player = useRef<ReelPlayer | null>(null);
  const previous = useRef<EditPlan | null>(null);
  const clock = useRef(0);
  const callbacks = useRef({ onTime, onPlayingChange });
  callbacks.current = { onTime, onPlayingChange };

  useImperativeHandle(ref, () => ({
    toggle: () => player.current?.toggle(),
    seek: (time) => player.current?.seek(time),
    setMuted: (value) => player.current?.setMuted(value),
    time: () => clock.current,
  }));

  // A layout effect, so the player exists before the first cut below is loaded into it.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the player lives as long as the stage does.
  useLayoutEffect(() => {
    if (!host.current) return;
    const reel = new ReelPlayer(host.current);
    reel.setMuted(muted);
    reel.onTick = (time) => {
      clock.current = time;
      callbacks.current.onTime?.(time);
    };
    reel.onPlayingChange = (playing) => callbacks.current.onPlayingChange?.(playing);
    player.current = reel;
    return () => {
      reel.destroy();
      player.current = null;
      previous.current = null;
    };
  }, []);

  // Stills are decoded ahead of time so a new cut appears with no flicker.
  useEffect(() => {
    for (const item of items) {
      if (item.kind === "photo") new Image().src = `/media/${item.id}/display`;
    }
  }, [items]);

  useLayoutEffect(() => {
    const reel = player.current;
    if (!reel) return;
    const before = previous.current;
    previous.current = plan;
    // Typing a title changes one line of text, so the reel keeps playing undisturbed.
    const sameCut =
      before?.shots === plan.shots &&
      before.aspect === plan.aspect &&
      before.template === plan.template;
    const title = plan.texts[0]?.text;
    if (sameCut && title && before?.texts[0] && reel.setTitle(title)) return;
    const track = catalog.tracks.find((entry) => entry.file === plan.music.src);
    reel.load(
      compositionFor(catalog, items, plan),
      plan,
      `/music/${track?.file ?? plan.music.src}`,
      {
        keepTime: sameCut,
      },
    );
    if (autoplay && !sameCut) reel.play();
  }, [catalog, items, plan, autoplay]);

  // Fits the full-size composition into whatever room there is.
  useLayoutEffect(() => {
    const element = frame.current;
    const inner = host.current;
    if (!element || !inner) return;
    const native =
      plan.aspect === "16:9"
        ? { w: 1920, h: 1080 }
        : { w: 1080, h: plan.aspect === "1:1" ? 1080 : 1920 };
    const fit = () => {
      inner.style.transform = `scale(${element.clientWidth / native.w})`;
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(element);
    return () => observer.disconnect();
  }, [plan.aspect]);

  return (
    <div className="stage-frame" ref={frame} style={{ aspectRatio: sizes[plan.aspect] }}>
      <div className="stage-host" ref={host} />
    </div>
  );
});
