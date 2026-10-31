import { describe, expect, it } from "vitest";
import { FairQueue, Scheduler, type TaskContext } from "./scheduler.ts";

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

function deferred() {
  let release = () => {};
  const done = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { done, release };
}

describe("FairQueue", () => {
  it("takes turns between owners", () => {
    const queue = new FairQueue<string>();
    for (const item of ["a1", "a2", "a3"]) queue.push("a", item);
    queue.push("b", "b1");
    queue.push("c", "c1");
    const order = [queue.shift(), queue.shift(), queue.shift(), queue.shift(), queue.shift()];
    expect(order).toEqual(["a1", "b1", "c1", "a2", "a3"]);
    expect(queue.shift()).toBeUndefined();
  });

  it("lets a new owner in ahead of someone's backlog", () => {
    const queue = new FairQueue<string>();
    for (const item of ["a1", "a2", "a3", "a4"]) queue.push("a", item);
    expect(queue.shift()).toBe("a1");
    queue.push("b", "b1");
    expect(queue.shift()).toBe("b1");
  });

  it("reports each item's place in the order it will run", () => {
    const queue = new FairQueue<string>();
    queue.push("a", "a1");
    queue.push("a", "a2");
    queue.push("b", "b1");
    expect(queue.order()).toEqual(["a1", "b1", "a2"]);
  });

  it("removes an item", () => {
    const queue = new FairQueue<string>();
    queue.push("a", "a1");
    queue.push("a", "a2");
    expect(queue.remove((item) => item === "a1")).toBe(true);
    expect(queue.remove((item) => item === "nope")).toBe(false);
    expect(queue.shift()).toBe("a2");
  });
});

describe("Scheduler", () => {
  function setup(slots: number) {
    const scheduler = new Scheduler<string>({ slots: () => slots });
    const gates = new Map<string, ReturnType<typeof deferred>>();
    const started: string[] = [];
    const submit = (id: string, owner = "a") => {
      const gate = deferred();
      gates.set(id, gate);
      return scheduler.submit({
        id,
        owner,
        run: async ({ signal }: TaskContext) => {
          started.push(id);
          await Promise.race([
            gate.done,
            new Promise((_, reject) => {
              signal.addEventListener("abort", () => reject(new Error("aborted")));
            }),
          ]);
          return `${id} done`;
        },
      });
    };
    return { scheduler, gates, started, submit };
  }

  it("never runs more tasks than it has slots", async () => {
    const { scheduler, gates, started, submit } = setup(2);
    const finishing = [submit("1"), submit("2"), submit("3")];
    await tick();
    expect(started).toEqual(["1", "2"]);
    expect(scheduler.stats()).toMatchObject({ running: 2, queued: 1, slots: 2 });
    gates.get("1")?.release();
    await tick();
    await tick();
    expect(started).toEqual(["1", "2", "3"]);
    gates.get("2")?.release();
    gates.get("3")?.release();
    await expect(Promise.all(finishing)).resolves.toEqual(["1 done", "2 done", "3 done"]);
  });

  it("is fair between owners under load", async () => {
    const { gates, started, submit } = setup(1);
    const greedy = ["a1", "a2", "a3", "a4"].map((id) => submit(id, "a"));
    const polite = submit("b1", "b");
    for (const id of ["a1", "b1", "a2", "a3", "a4"]) {
      await tick();
      gates.get(id)?.release();
      await tick();
    }
    await Promise.all([...greedy, polite]);
    expect(started).toEqual(["a1", "b1", "a2", "a3", "a4"]);
  });

  it("reports a queued task's place in line", async () => {
    const { scheduler, submit } = setup(1);
    void submit("1", "a").catch(() => {});
    void submit("2", "a").catch(() => {});
    void submit("3", "b").catch(() => {});
    await tick();
    expect(scheduler.position("3")).toBe(1);
    expect(scheduler.position("2")).toBe(2);
    expect(scheduler.position("1")).toBe(0);
    expect(scheduler.position("unknown")).toBeNull();
    scheduler.cancel("1");
    scheduler.cancel("2");
    scheduler.cancel("3");
  });

  it("cancels a queued task without running it", async () => {
    const { scheduler, started, submit, gates } = setup(1);
    const first = submit("1");
    const second = submit("2");
    await tick();
    scheduler.cancel("2");
    await expect(second).rejects.toThrow("Cancelled");
    gates.get("1")?.release();
    await first;
    expect(started).toEqual(["1"]);
  });

  it("stops a running task when it's cancelled, then frees the slot", async () => {
    const { scheduler, started, submit, gates } = setup(1);
    const first = submit("1");
    const second = submit("2");
    await tick();
    scheduler.cancel("1");
    await expect(first).rejects.toThrow();
    await tick();
    await tick();
    expect(started).toEqual(["1", "2"]);
    gates.get("2")?.release();
    await second;
  });

  it("keeps working after a task fails", async () => {
    const scheduler = new Scheduler<string>({ slots: () => 1 });
    const bad = scheduler.submit({
      id: "bad",
      owner: "a",
      run: async () => {
        throw new Error("boom");
      },
    });
    const good = scheduler.submit({ id: "good", owner: "a", run: async () => "fine" });
    await expect(bad).rejects.toThrow("boom");
    await expect(good).resolves.toBe("fine");
  });

  it("shares one run between identical submissions", async () => {
    const { scheduler, gates, started, submit } = setup(2);
    const first = submit("same");
    const second = scheduler.submit({ id: "same", owner: "b", run: async () => "other" });
    await tick();
    gates.get("same")?.release();
    await expect(first).resolves.toBe("same done");
    await expect(second).resolves.toBe("same done");
    expect(started).toEqual(["same"]);
  });

  it("tells listeners when the queue changes", async () => {
    const { scheduler, gates, submit } = setup(1);
    const seen: number[] = [];
    scheduler.onChange(() => seen.push(scheduler.stats().queued));
    const first = submit("1");
    const second = submit("2");
    await tick();
    gates.get("1")?.release();
    await first;
    await tick();
    gates.get("2")?.release();
    await second;
    expect(seen.length).toBeGreaterThanOrEqual(3);
    expect(seen.at(-1)).toBe(0);
  });
});
