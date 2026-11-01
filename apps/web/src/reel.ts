import { composeParts } from "@u-cut/compose";
import {
  matchTrack,
  matchVibe,
  planRules,
  replaceShot,
  setTitle,
  swapShots,
} from "@u-cut/planner-rules";
import type { Aspect, EditPlan, MediaItem, StyleRecipe, Vibe } from "@u-cut/schema";
import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import {
  api,
  type Catalog,
  connectEvents,
  type Job,
  mediaUrl,
  type RenderEvent,
  type ServerEvent,
} from "./api";

export interface Settings {
  vibe: Vibe;
  template: string;
  aspect: Aspect;
  duration: number;
  seed: number;
  title: string;
  excludedScenes: string[];
  /** The style of a reel you matched. It takes over from the vibe and template while it's on. */
  recipe: StyleRecipe | null;
}

interface Snapshot {
  settings: Settings;
  plan: EditPlan;
}

interface State {
  job: Job | null;
  items: MediaItem[];
  ready: string[];
  /** Files still on their way, so the plan waits until everything has arrived. */
  arriving: number;
  now: Snapshot | null;
  past: Snapshot[];
  future: Snapshot[];
  render: RenderEvent | null;
  notice: string | null;
  studying: boolean;
}

type Action =
  | { type: "job"; job: Job }
  | { type: "arriving"; count: number }
  | { type: "item"; item: MediaItem }
  | { type: "items"; items: MediaItem[] }
  | { type: "ready"; id: string; item?: MediaItem | undefined }
  | { type: "failed"; id: string; reason: string }
  | { type: "commit"; snapshot: Snapshot }
  | { type: "replace"; snapshot: Snapshot }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "render"; render: RenderEvent | null }
  | { type: "notice"; notice: string | null }
  | { type: "studying"; studying: boolean }
  | { type: "reset" };

const historyLimit = 100;
const empty: State = {
  job: null,
  items: [],
  ready: [],
  arriving: 0,
  now: null,
  past: [],
  future: [],
  render: null,
  notice: null,
  studying: false,
};

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "job":
      return { ...state, job: action.job };
    case "arriving":
      return { ...state, arriving: Math.max(0, state.arriving + action.count) };
    case "item":
      return state.items.some((item) => item.id === action.item.id)
        ? state
        : { ...state, items: [...state.items, action.item] };
    case "items":
      return { ...state, items: action.items };
    case "ready": {
      const { item } = action;
      return {
        ...state,
        items: item
          ? state.items.map((known) => (known.id === item.id ? item : known))
          : state.items,
        ready: state.ready.includes(action.id) ? state.ready : [...state.ready, action.id],
      };
    }
    case "failed":
      return {
        ...state,
        items: state.items.filter((item) => item.id !== action.id),
        notice: action.reason,
      };
    case "commit":
      return {
        ...state,
        now: action.snapshot,
        past: state.now ? [...state.past, state.now].slice(-historyLimit) : state.past,
        future: [],
      };
    case "replace":
      return { ...state, now: action.snapshot };
    case "undo": {
      const previous = state.past.at(-1);
      if (!previous || !state.now) return state;
      return {
        ...state,
        now: previous,
        past: state.past.slice(0, -1),
        future: [state.now, ...state.future],
      };
    }
    case "redo": {
      const [next, ...rest] = state.future;
      if (!next || !state.now) return state;
      return { ...state, now: next, past: [...state.past, state.now], future: rest };
    }
    case "render":
      return { ...state, render: action.render };
    case "notice":
      return { ...state, notice: action.notice };
    case "studying":
      return { ...state, studying: action.studying };
    case "reset":
      return empty;
  }
}

const defaults: Settings = {
  vibe: "chill",
  template: "travel-montage",
  aspect: "9:16",
  duration: 20,
  seed: 1,
  title: "",
  excludedScenes: ["documents"],
  recipe: null,
};

export function planWith(catalog: Catalog, items: MediaItem[], settings: Settings): EditPlan {
  const { recipe } = settings;
  const templateId = recipe ? "recipe" : settings.template;
  const template = catalog.templates.find((entry) => entry.manifest.id === templateId);
  const track = recipe
    ? matchTrack(recipe, catalog.tracks)
    : catalog.tracks.find((entry) => entry.vibe === settings.vibe);
  if (!template || !track) throw new Error("U-Cut's templates didn't load. Reload the page.");
  return planRules({
    items,
    template: template.manifest,
    vibe: recipe ? matchVibe(recipe) : settings.vibe,
    aspect: settings.aspect,
    duration: settings.duration,
    music: { src: track.file, length: track.length, beats: track.beats },
    copy: { title: settings.title },
    excludedScenes: settings.excludedScenes,
    recipe,
    seed: settings.seed,
  });
}

export function compositionFor(catalog: Catalog, items: MediaItem[], plan: EditPlan) {
  const template = catalog.templates.find((entry) => entry.manifest.id === plan.template);
  return composeParts({
    plan,
    items: Object.fromEntries(items.map((item) => [item.id, item])),
    templateCss: template?.css ?? "",
    fontCss: "",
    omitAudio: true,
    assets: { media: mediaUrl, music: () => "" },
  });
}

const settingsFrom = (
  plan: EditPlan,
  excludedScenes: string[],
  recipe: StyleRecipe | null,
): Settings => ({
  vibe: plan.vibe,
  template: plan.template,
  aspect: plan.aspect,
  duration: Math.round(plan.duration),
  seed: plan.seed,
  title: plan.texts.find((text) => text.style === "title")?.text ?? "",
  excludedScenes,
  recipe,
});

const jobKey = "ucut-job";
const uploadsAtOnce = 3;

export function useReel(catalog: Catalog | null) {
  const [state, dispatch] = useReducer(reducer, empty);
  const latest = useRef(state);
  latest.current = state;
  const plannedCount = useRef(0);

  useEffect(
    () =>
      connectEvents((event: ServerEvent) => {
        if (event.type === "media") {
          if (event.job !== latest.current.job?.id) return;
          if (event.state === "ready") dispatch({ type: "ready", id: event.id, item: event.item });
          else
            dispatch({
              type: "failed",
              id: event.id,
              reason: event.reason ?? "A file couldn't be read.",
            });
        } else if (event.id === latest.current.render?.id) {
          dispatch({ type: "render", render: event });
        }
      }),
    [],
  );

  // Pick up where you left off after a reload.
  useEffect(() => {
    if (!catalog) return;
    const saved = window.localStorage.getItem(jobKey);
    if (!saved) return;
    api.job(saved).then(
      (job) => {
        if (!job.plan) return;
        dispatch({ type: "job", job });
        dispatch({ type: "items", items: job.items });
        for (const item of job.items) dispatch({ type: "ready", id: item.id });
        dispatch({
          type: "commit",
          snapshot: {
            plan: job.plan,
            settings: settingsFrom(job.plan, job.excludedScenes, job.recipe),
          },
        });
      },
      () => window.localStorage.removeItem(jobKey),
    );
  }, [catalog]);

  // Once everything has arrived, the reel appears without anyone asking for it.
  const allReady =
    state.arriving === 0 &&
    state.items.length > 0 &&
    state.items.every((item) => state.ready.includes(item.id));
  useEffect(() => {
    if (!catalog || !allReady) return;
    if (state.now && plannedCount.current === state.items.length) return;
    plannedCount.current = state.items.length;
    try {
      const settings = state.now?.settings ?? defaults;
      dispatch({
        type: "commit",
        snapshot: { settings, plan: planWith(catalog, state.items, settings) },
      });
    } catch (error) {
      dispatch({ type: "notice", notice: (error as Error).message });
    }
  }, [catalog, allReady, state.now, state.items]);

  // Saved quietly a moment after the last change.
  const plan = state.now?.plan;
  const jobId = state.job?.id;
  useEffect(() => {
    if (!plan || !jobId) return;
    const timer = setTimeout(() => void api.savePlan(jobId, plan).catch(() => {}), 300);
    return () => clearTimeout(timer);
  }, [plan, jobId]);

  const ensureJob = useCallback(async () => {
    if (latest.current.job) return latest.current.job;
    const job = await api.createJob();
    window.localStorage.setItem(jobKey, job.id);
    dispatch({ type: "job", job });
    return job;
  }, []);

  const addFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      dispatch({ type: "arriving", count: files.length });
      const job = await ensureJob();
      const queue = [...files];
      const worker = async () => {
        for (let file = queue.shift(); file; file = queue.shift()) {
          try {
            dispatch({ type: "item", item: await api.upload(job.id, file) });
          } catch (error) {
            dispatch({ type: "notice", notice: (error as Error).message });
          }
          dispatch({ type: "arriving", count: -1 });
        }
      };
      await Promise.all(Array.from({ length: uploadsAtOnce }, worker));
    },
    [ensureJob],
  );

  const addSamples = useCallback(async () => {
    const job = await ensureJob();
    const updated = await api.addSamples(job.id);
    dispatch({ type: "items", items: updated.items });
  }, [ensureJob]);

  /** Re-cuts the reel. This runs here in the browser, so it's instant for everyone. */
  const change = useCallback(
    (patch: Partial<Settings>) => {
      const { now, items } = latest.current;
      if (!catalog || !now) return;
      const settings = { ...now.settings, ...patch };
      try {
        dispatch({
          type: "commit",
          snapshot: { settings, plan: planWith(catalog, items, settings) },
        });
      } catch (error) {
        dispatch({ type: "notice", notice: (error as Error).message });
      }
    },
    [catalog],
  );

  const remix = useCallback(() => {
    const seed = latest.current.now?.settings.seed ?? 1;
    change({ seed: seed + 1 });
  }, [change]);

  const editPlan = useCallback(
    (edit: (plan: EditPlan) => EditPlan, settings?: Partial<Settings>) => {
      const { now } = latest.current;
      if (!now) return;
      try {
        dispatch({
          type: "commit",
          snapshot: { settings: { ...now.settings, ...settings }, plan: edit(now.plan) },
        });
      } catch (error) {
        dispatch({ type: "notice", notice: (error as Error).message });
      }
    },
    [],
  );

  const rename = useCallback((title: string) => {
    const { now } = latest.current;
    if (!now) return;
    dispatch({
      type: "replace",
      snapshot: { settings: { ...now.settings, title }, plan: setTitle(now.plan, title) },
    });
  }, []);

  /** Moves a photo to the right scene, and re-cuts because that can change what's in the reel. */
  const setScene = useCallback(
    async (item: MediaItem, scene: string) => {
      const { job, now, items } = latest.current;
      if (!job) return;
      const updated = {
        ...item,
        labels: [
          { id: scene, score: 1 },
          ...item.labels.filter((label) => label.id !== scene),
        ].slice(0, 3),
      };
      const next = items.map((known) => (known.id === item.id ? updated : known));
      dispatch({ type: "items", items: next });
      latest.current = { ...latest.current, items: next };
      try {
        await api.setScene(job.id, item.id, scene);
      } catch (error) {
        dispatch({ type: "notice", notice: (error as Error).message });
      }
      if (now) change({});
    },
    [change],
  );

  const setExcluded = useCallback(
    (excludedScenes: string[]) => {
      const { job } = latest.current;
      change({ excludedScenes });
      if (job) void api.setExcluded(job.id, excludedScenes).catch(() => {});
    },
    [change],
  );

  /** Studies a reel on this computer, then re-cuts yours to its structure. */
  const matchReel = useCallback(
    async (file: File) => {
      const { job } = latest.current;
      if (!job) return;
      dispatch({ type: "studying", studying: true });
      try {
        const { recipe } = await api.studyReel(job.id, file);
        change({ recipe, aspect: recipe.aspect, duration: Math.round(recipe.duration) });
      } catch (error) {
        dispatch({ type: "notice", notice: (error as Error).message });
      }
      dispatch({ type: "studying", studying: false });
    },
    [change],
  );

  const forgetReel = useCallback(
    (patch: Partial<Settings>) => {
      const { job } = latest.current;
      change({ ...patch, recipe: null });
      if (job) void api.forgetReel(job.id).catch(() => {});
    },
    [change],
  );

  const replace = useCallback(
    (index: number, item: MediaItem) => editPlan((plan) => replaceShot(plan, index, item)),
    [editPlan],
  );

  const swap = useCallback(
    (first: number, second: number) => {
      const items = Object.fromEntries(latest.current.items.map((item) => [item.id, item]));
      editPlan((plan) => swapShots(plan, first, second, items));
    },
    [editPlan],
  );

  const exportReel = useCallback(async () => {
    const { job, now } = latest.current;
    if (!job || !now) return;
    try {
      await api.savePlan(job.id, now.plan);
      const name = now.settings.title.trim() || "U-Cut reel";
      dispatch({ type: "render", render: await api.exportReel(job.id, name) });
    } catch (error) {
      dispatch({ type: "notice", notice: (error as Error).message });
    }
  }, []);

  const cancelExport = useCallback(() => {
    const { render } = latest.current;
    if (render && render.state !== "done") void api.cancelRender(render.id).catch(() => {});
    dispatch({ type: "render", render: null });
  }, []);

  const startOver = useCallback(() => {
    window.localStorage.removeItem(jobKey);
    plannedCount.current = 0;
    dispatch({ type: "reset" });
  }, []);

  const actions = useMemo(
    () => ({
      addFiles,
      addSamples,
      change,
      remix,
      rename,
      replace,
      swap,
      setScene,
      setExcluded,
      matchReel,
      forgetReel,
      exportReel,
      cancelExport,
      startOver,
      undo: () => dispatch({ type: "undo" }),
      redo: () => dispatch({ type: "redo" }),
      dismiss: () => dispatch({ type: "notice", notice: null }),
    }),
    [
      addFiles,
      addSamples,
      change,
      remix,
      rename,
      replace,
      swap,
      setScene,
      setExcluded,
      matchReel,
      forgetReel,
      exportReel,
      cancelExport,
      startOver,
    ],
  );

  return { state, actions };
}
