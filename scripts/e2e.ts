/// <reference lib="dom" />
// Uses U-Cut the way a person does, in a real browser, and checks each step.
// Run with: pnpm test:e2e [folder-for-screenshots]

import { type ChildProcess, execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer, { type Page } from "puppeteer-core";
import { appChange, appReel } from "../packages/engine/src/mcp/app-link.ts";

// The Mac app's FFmpeg has no libx264, so test clips use Apple's encoder on a Mac.
const h264 =
  process.platform === "darwin"
    ? ["-c:v", "h264_videotoolbox", "-allow_sw", "1", "-b:v", "6M"]
    : ["-c:v", "libx264"];

const port = 4198;
const base = `http://localhost:${port}`;
const shots = process.argv[2] ?? "";
const engine = fileURLToPath(new URL("../packages/engine/src/bin.ts", import.meta.url));

function chromePath(): string {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const installed = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  if (existsSync(installed)) return installed;
  const cache = join(homedir(), ".cache/puppeteer/chrome");
  const version = existsSync(cache) ? readdirSync(cache).sort().at(-1) : undefined;
  if (!version) throw new Error("Set CHROME_PATH to a Chrome binary.");
  return join(
    cache,
    version,
    "chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
  );
}

async function waitForServer(server: ChildProcess) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (server.exitCode !== null) throw new Error("The server stopped while starting.");
    const ok = await fetch(`${base}/api/status`).then(
      (r) => r.ok,
      () => false,
    );
    if (ok) return;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error("The server didn't start.");
}

/** Half-second shots in bright colours, over a 120 BPM click. */
function makeTestReel(path: string) {
  const colours = ["red", "blue", "yellow", "green", "white", "purple"];
  const inputs = Array.from({ length: 16 }, (_, index) => [
    "-f",
    "lavfi",
    "-i",
    `color=${colours[index % colours.length]}:s=360x640:r=30:d=0.5`,
  ]).flat();
  const joined = `${Array.from({ length: 16 }, (_, index) => `[${index}:v]`).join("")}concat=n=16:v=1:a=0[v]`;
  execFileSync("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-y", ...inputs,
    "-f", "lavfi", "-i", "aevalsrc=0.8*sin(2*PI*60*t)*exp(-30*mod(t\\,0.5)):d=8:s=48000",
    "-filter_complex", joined, "-map", "[v]", "-map", "16:a",
    ...h264, "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", path,
  ]); // biome-ignore format: flags read better in pairs
}

/** A dark screen where one panel opens, then another. It has no sound, like many recordings. */
function makeTestRecording(path: string) {
  const panels = [
    "drawbox=x=800:y=100:w=300:h=200:color=white:t=fill:enable='between(t,3,5)'",
    "drawbox=x=100:y=480:w=300:h=180:color=white:t=fill:enable='between(t,8,10)'",
  ].join(",");
  execFileSync("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-y",
    "-f", "lavfi", "-i", `color=c=0x101018:s=1280x720:r=30:d=12,${panels}`,
    ...h264, "-pix_fmt", "yuv420p", path,
  ]); // biome-ignore format: flags read better in pairs
}

const results: string[] = [];
function pass(name: string, detail = "") {
  results.push(`  ok   ${name}${detail ? `  (${detail})` : ""}`);
}

async function snap(page: Page, name: string) {
  if (shots) await page.screenshot({ path: join(shots, `${name}.png`) as `${string}.png` });
}

const shotList = (page: Page) =>
  page.$$eval(".shot-tile img", (images) =>
    images.map((image) => (image as HTMLImageElement).src).join(),
  );

async function clickButton(page: Page, name: string) {
  await page.$$eval(
    "button, a",
    (elements, text) => {
      const match = elements.find((element) => element.textContent?.trim() === text);
      if (!match) throw new Error(`No button called ${text}`);
      (match as HTMLElement).click();
    },
    name,
  );
}

async function main() {
  let stopServer = () => {};
  // A stuck browser must fail the run, not hang it.
  setTimeout(() => {
    console.log(results.join("\n"));
    console.error("\nFAILED: the browser test took longer than 12 minutes.");
    stopServer();
    process.exit(1);
  }, 720_000).unref();
  if (shots) mkdirSync(shots, { recursive: true });
  // Chrome draws no frames on a sleeping display, which looks exactly like a frozen page.
  const awake =
    process.platform === "darwin" ? spawn("caffeinate", ["-u", "-t", "480"]) : undefined;
  // Found first, so a missing browser fails at once instead of leaving the server running.
  const executablePath = chromePath();
  const home = mkdtempSync(join(tmpdir(), "ucut-e2e-"));
  const server = spawn(
    process.execPath,
    [
      "--conditions=source",
      "--import",
      "tsx",
      engine,
      "serve",
      "--port",
      String(port),
      "--no-open",
    ],
    {
      // CI machines have no GPU, so a full-quality export takes them over five minutes.
      env: {
        ...process.env,
        UCUT_HOME: home,
        // Keys stay in the test's own folder, never in this Mac's Keychain.
        UCUT_SECRETS: "file",
        ...(process.env.CI ? { UCUT_EXPORT_QUALITY: "draft" } : {}),
      },
      stdio: "ignore",
    },
  );
  stopServer = () => server.kill("SIGTERM");
  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    // Every wait is one call to the browser, so this has to outlast the longest wait below.
    protocolTimeout: 330_000,
    args: ["--autoplay-policy=no-user-gesture-required", "--no-sandbox"],
  });

  try {
    await waitForServer(server);
    const page = await browser.newPage();
    const problems: string[] = [];
    page.on("pageerror", (error) => problems.push(`Page error: ${(error as Error).message}`));
    page.on("console", (message) => {
      if (message.type() === "error") problems.push(`Console: ${message.text()}`);
    });
    page.on("requestfailed", (request) => {
      if (
        !request.url().includes("/api/events") &&
        request.failure()?.errorText !== "net::ERR_ABORTED"
      ) {
        problems.push(`Failed: ${request.url()}`);
      }
    });
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });

    const loadStart = performance.now();
    await page.goto(base);
    await page.waitForSelector(".splash");
    await new Promise((resolve) => setTimeout(resolve, 1200));
    await snap(page, "0-splash");
    await page.waitForSelector(".splash", { hidden: true, timeout: 5000 });
    pass("the splash plays, then gets out of the way");
    await page.waitForSelector(".headline");
    pass("first screen appears", `${(performance.now() - loadStart).toFixed(0)} ms`);

    await page.waitForSelector(".start-reel .stage-frame", { timeout: 30_000 });
    await new Promise((resolve) => setTimeout(resolve, 1800));
    await snap(page, "1-start");
    const showing = await page.$eval(".start-reel .stage-host", (host) =>
      [...(host.shadowRoot?.querySelectorAll<HTMLElement>(".shot") ?? [])].some(
        (shot) => shot.style.visibility === "visible",
      ),
    );
    if (!showing) throw new Error("The first screen's reel is blank.");
    pass("first screen plays a real reel");

    const started = performance.now();
    await clickButton(page, "Try it with sample photos");
    await page.waitForSelector(".studio", { timeout: 60_000 });
    pass("samples become a playing reel", `${(performance.now() - started).toFixed(0)} ms`);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await snap(page, "2-studio");

    const before = await shotList(page);
    const remixStart = performance.now();
    await page.keyboard.press("r");
    await page.waitForFunction(
      (previous) =>
        [...document.querySelectorAll(".shot-tile img")]
          .map((image) => (image as HTMLImageElement).src)
          .join() !== previous,
      {},
      before,
    );
    const remixTime = performance.now() - remixStart;
    if ((await shotList(page)) === before) throw new Error("Remix didn't change the cut.");
    pass("R remixes the cut", `${remixTime.toFixed(0)} ms`);

    await page.keyboard.down("Meta");
    await page.keyboard.press("z");
    await page.keyboard.up("Meta");
    await page.waitForFunction(
      (previous) =>
        [...document.querySelectorAll(".shot-tile img")]
          .map((image) => (image as HTMLImageElement).src)
          .join() === previous,
      {},
      before,
    );
    pass("undo brings the last cut back");

    await clickButton(page, "Hype");
    await page.waitForFunction(
      () => document.querySelector('.vibes button[aria-pressed="true"]')?.textContent === "Hype",
    );
    await new Promise((resolve) => setTimeout(resolve, 600));
    pass("changing the vibe re-cuts the reel");

    const title = "Long way home";
    await page.click(".title-field input");
    await page.keyboard.type(title);
    await new Promise((resolve) => setTimeout(resolve, 700));
    await snap(page, "3-hype-titled");
    const shown = await page.$eval(
      ".stage-host",
      (host) => host.shadowRoot?.querySelector(".text-title")?.textContent,
    );
    if (shown !== title) throw new Error(`The title on the reel says "${shown}".`);
    pass("the title appears on the reel as you type");

    await page.click(".style-current");
    await page.waitForSelector(".gallery[open] .gallery-card img");
    await page.waitForFunction(
      () =>
        [...document.querySelectorAll<HTMLImageElement>(".gallery-card img")].every(
          (image) => image.complete && image.naturalWidth > 0,
        ),
      { timeout: 15_000 },
    );
    const styles = await page.$$eval(".gallery-name", (names) =>
      names.map((name) => name.textContent),
    );
    for (const wanted of ["Café crawl", "Day in my life", "Travel montage"]) {
      if (!styles.includes(wanted)) throw new Error(`The style gallery has no ${wanted}.`);
    }
    await snap(page, "3b-styles");
    await page.$$eval(".gallery-card", (cards) =>
      (cards.find((card) => card.textContent?.includes("Café crawl")) as HTMLElement).click(),
    );
    await page.waitForSelector(".gallery", { hidden: true });
    const picked = await page.$eval("#style-name", (name) => name.textContent);
    if (picked !== "Café crawl")
      throw new Error(`The style says ${picked} after picking Café crawl.`);
    pass("the style gallery plays each preview and switches the style", `${styles.length} styles`);

    const legends = await page.$$eval(".controls legend", (all) =>
      all.map((legend) => legend.textContent),
    );
    if (!legends.includes("Sound effects")) throw new Error("There's no Sound effects switch.");
    await clickButton(page, "Off");
    await new Promise((resolve) => setTimeout(resolve, 400));
    await clickButton(page, "On");
    pass("sound effects can be switched off and on");

    await page.$eval(".title-field input", (input) => (input as HTMLInputElement).blur());
    await clickButton(page, "Connections");
    await page.waitForSelector(".connections .connections-row");
    const chosen = await page.$$eval('.connections-row button[aria-pressed="true"]', (buttons) =>
      buttons.map((button) => button.textContent),
    );
    if (chosen.join() !== "U\u2011Cut,This computer,This computer") {
      throw new Error(`Connections starts with ${chosen.join(", ")} chosen.`);
    }
    pass("connections start with everything on this Mac");

    await clickButton(page, "Give this reel to your assistant");
    await page.waitForFunction(() =>
      document.querySelector(".handoff code")?.textContent?.includes("/assistant/"),
    );
    await new Promise((resolve) => setTimeout(resolve, 400));
    await snap(page, "4b-connections");
    const prompt = await page.$eval(".handoff code", (code) => code.textContent ?? "");
    const link = /http:\/\/\S+\/assistant\/[a-f0-9]{48}/.exec(prompt)?.[0];
    if (!link) throw new Error(`The assistant prompt has no link: ${prompt}`);
    // The same calls `ucut mcp` makes for app_reel and app_change.
    const opened = (await appReel(link)) as { kind: string; open: boolean };
    if (opened.kind !== "photos" || !opened.open) {
      throw new Error(`The assistant sees: ${JSON.stringify(opened)}`);
    }
    await appChange(link, { title: "Made with an assistant" });
    await clickButton(page, "Done");
    await page.waitForFunction(
      () =>
        document.querySelector(".stage-host")?.shadowRoot?.querySelector(".text-title")
          ?.textContent === "Made with an assistant",
      { timeout: 10_000 },
    );
    pass("an assistant changes the open reel through its link");

    await page.keyboard.down("Meta");
    await page.keyboard.press("z");
    await page.keyboard.up("Meta");
    await page.waitForFunction(
      (expected) =>
        document.querySelector(".stage-host")?.shadowRoot?.querySelector(".text-title")
          ?.textContent === expected,
      { timeout: 10_000 },
      title,
    );
    pass("undo takes back the assistant's change");
    // Its notice would otherwise still be showing when later steps read notices.
    await page
      .$eval(".notice button", (button) => (button as HTMLButtonElement).click())
      .catch(() => {});
    await page.waitForSelector(".notice button", { hidden: true, timeout: 5000 });

    await page.$eval(".title-field input", (input) => (input as HTMLInputElement).blur());
    await clickButton(page, "Square");
    await new Promise((resolve) => setTimeout(resolve, 500));
    await snap(page, "4-square");
    await clickButton(page, "Tall");
    pass("the shape can change");

    await page.click(".shot-tile:nth-child(2)");
    await page.waitForSelector(".swap");
    await new Promise((resolve) => setTimeout(resolve, 300));
    await snap(page, "5-replace-shot");
    const beforeSwap = await shotList(page);
    await page.click(".swap ul li:nth-child(1) button");
    await new Promise((resolve) => setTimeout(resolve, 400));
    if ((await shotList(page)) === beforeSwap) throw new Error("Replacing a shot did nothing.");
    pass("a shot can be replaced in one click");

    await clickButton(page, "Sort your photos");
    await page.waitForSelector(".sort");
    await new Promise((resolve) => setTimeout(resolve, 500));
    await snap(page, "5b-sort");
    const scenes = await page.$$eval(".scene-list li button", (buttons) => buttons.length);
    if (scenes < 2) throw new Error(`Sorting found only ${scenes} scene.`);
    pass("photos are sorted into scenes", `${scenes} scenes`);

    const firstScene = await page.$eval(".sheet-grid section h3", (title) => title.textContent);
    const beforeMove = await page.$$eval(
      ".sheet-grid section:first-child li.print-holder",
      (tiles) => tiles.length,
    );
    await page.click(".sheet-grid section:first-child .print");
    await page.waitForSelector(".scene-menu");
    await snap(page, "5c-scene-menu");
    await clickButton(page, "Snow");
    await page.waitForFunction(
      (count, name) =>
        document.querySelector(".sheet-grid section h3")?.textContent !== name ||
        document.querySelectorAll(".sheet-grid section:first-child li.print-holder").length < count,
      {},
      beforeMove,
      firstScene,
    );
    pass("a photo can be moved to another scene in one gesture");

    const reelBefore = await page.$$eval(
      ".scene-list li button",
      (buttons) => (buttons[0] as HTMLButtonElement).textContent,
    );
    await page.$eval(".scene-list li button", (button) => (button as HTMLButtonElement).click());
    await page.waitForFunction(
      () =>
        document.querySelector(".scene-list li button")?.getAttribute("aria-pressed") === "false",
    );
    await page.$eval(".scene-list li button", (button) => (button as HTMLButtonElement).click());
    pass("a scene can be left out and brought back", reelBefore?.trim() ?? "");

    await clickButton(page, "Done");
    await page.waitForSelector(".sort", { hidden: true });

    const reel = join(home, "reel-to-match.mp4");
    makeTestReel(reel);
    // Matching changes the pacing, so the shots' lengths change even when their number doesn't.
    const pacing = () =>
      page.$$eval(".shot-tile", (tiles) =>
        tiles.map((tile) => (tile as HTMLElement).style.flexGrow).join(),
      );
    const shotsBefore = await pacing();
    const reelInput = await page.$('input[aria-label="Choose a reel to match"]');
    await reelInput?.uploadFile(reel);
    // Notices fade after seven seconds, so this watches for one instead of reading it at the end.
    const studied = await page.waitForFunction(
      () =>
        document.querySelector(".recipe-card")
          ? "ok"
          : document.querySelector(".notice button")?.textContent,
      { timeout: 120_000 },
    );
    const outcome = await studied.jsonValue();
    if (outcome !== "ok") throw new Error(`Matching a reel failed. The app says: ${outcome}`);
    await new Promise((resolve) => setTimeout(resolve, 700));
    await snap(page, "5d-matched-reel");
    const card = await page.$eval(".recipe-card p", (paragraph) => paragraph.textContent ?? "");
    if (!card.startsWith("Fast, about 0.5 s a shot")) throw new Error(`The card says: ${card}`);
    const shotsAfter = await pacing();
    if (shotsAfter === shotsBefore) throw new Error("Matching a reel didn't change the cut.");
    pass("a reel you love is studied and your reel takes on its rhythm", card);

    await clickButton(page, "Hype");
    await page.waitForSelector(".recipe-card", { hidden: true });
    pass("choosing a vibe goes back to normal");

    await page.reload();
    await page.waitForSelector(".studio", { timeout: 15_000 });
    const resumed = await page.$eval(
      ".title-field input",
      (input) => (input as HTMLInputElement).value,
    );
    if (resumed !== title) throw new Error("The reel didn't come back after a reload.");
    pass("your reel survives a reload");

    await page.waitForSelector(".shot-tile");
    await clickButton(page, "10 s");
    await new Promise((resolve) => setTimeout(resolve, 500));
    await clickButton(page, "Export");
    await page.waitForSelector(".sheet");
    await new Promise((resolve) => setTimeout(resolve, 2500));
    await snap(page, "6-exporting");
    await page.waitForSelector(".final", { timeout: 300_000 }).catch(async (error: Error) => {
      const sheet = await page.$eval(".sheet", (element) => element.textContent).catch(() => "");
      throw new Error(`${error.message}. The export screen says: ${sheet}`);
    });
    await new Promise((resolve) => setTimeout(resolve, 1200));
    await snap(page, "7-done");
    const video = await page.$eval(".final", (element) => {
      const final = element as HTMLVideoElement;
      return { width: final.videoWidth, height: final.videoHeight, duration: final.duration };
    });
    if (video.width !== 1080 || video.height !== 1920)
      throw new Error(`Export is ${video.width}x${video.height}.`);
    pass(
      "export finishes and plays",
      `${video.duration.toFixed(1)} s at ${video.width}x${video.height}`,
    );

    await clickButton(page, "Back to editing");
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true });
    await page.waitForSelector(".studio", { timeout: 15_000 });
    await new Promise((resolve) => setTimeout(resolve, 1200));
    await snap(page, "8-phone");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    if (overflow) throw new Error("The page scrolls sideways at phone width.");
    pass("works at phone width");

    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
    // Leaving phone mode reloads the page.
    await page.waitForSelector(".studio", { timeout: 30_000 });
    page.once("dialog", (dialog) => void dialog.accept());
    await clickButton(page, "New reel");
    await page.waitForSelector(".headline");
    const recording = join(home, "recording.mp4");
    makeTestRecording(recording);
    const recordingInput = await page.$('input[aria-label="Choose a screen recording"]');
    await recordingInput?.uploadFile(recording);
    await page.waitForSelector(".moments .pick", { timeout: 180_000 });
    const picks = await page.$$eval(".pick", (list) => list.length);
    if (picks < 2) throw new Error(`Only ${picks} moment was found in the recording.`);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await snap(page, "9-demo");
    pass("a screen recording becomes moments to keep or skip", `${picks} moments`);

    await page.type(".title-field input", "Acme");
    await page.waitForFunction(
      () =>
        document.querySelector(".stage-host")?.shadowRoot?.querySelector(".card span")
          ?.textContent === "Acme",
      { timeout: 10_000 },
    );
    pass("the brand name appears on the card");

    const noteBefore = await page.$eval(".demo-note", (note) => note.textContent);
    await page.click(".pick-toggle");
    await page.waitForFunction(
      (before) => document.querySelector(".demo-note")?.textContent !== before,
      { timeout: 5000 },
      noteBefore,
    );
    pass("a moment can be skipped");

    await clickButton(page, "Export");
    await page.waitForSelector(".final", { timeout: 300_000 });
    await new Promise((resolve) => setTimeout(resolve, 1200));
    const demoVideo = await page.$eval(".final", (element) => {
      const final = element as HTMLVideoElement;
      return { width: final.videoWidth, height: final.videoHeight };
    });
    if (demoVideo.width !== 1920 || demoVideo.height !== 1080)
      throw new Error(`The demo is ${demoVideo.width}x${demoVideo.height}.`);
    pass("the demo exports wide, like the recording");

    await clickButton(page, "Back to editing");
    await page.waitForSelector(".studio", { timeout: 15_000 });
    page.once("dialog", (dialog) => void dialog.accept());
    await clickButton(page, "New reel");
    await page.waitForSelector(".start-prompt textarea");
    await page.type(".start-prompt textarea", "a 12-second reel about my Goa trip, hype vibe");
    await page.keyboard.press("Enter");
    await page.waitForSelector(".moments .pick textarea", { timeout: 15_000 });
    const lineCount = await page.$$eval(".pick textarea", (list) => list.length);
    const kinetic = await page.$eval(
      ".stage-host",
      (host) => host.shadowRoot?.querySelectorAll(".text-kinetic .word").length ?? 0,
    );
    if (kinetic === 0) throw new Error("The script's words aren't on the reel.");
    await new Promise((resolve) => setTimeout(resolve, 1200));
    await snap(page, "10-written");
    pass("a sentence becomes a script and a reel", `${lineCount} lines`);

    const firstLine = await page.$(".pick textarea");
    await firstLine?.click({ count: 3 });
    await page.keyboard.down("Meta");
    await page.keyboard.press("a");
    await page.keyboard.up("Meta");
    await page.keyboard.type("Goa was worth it.");
    await page.keyboard.press("Tab");
    await page.waitForFunction(
      () =>
        [...(document.querySelector(".stage-host")?.shadowRoot?.querySelectorAll(".word") ?? [])]
          .map((word) => word.textContent)
          .join(" ")
          .includes("Goa was worth it."),
      { timeout: 10_000 },
    );
    pass("a line can be rewritten and the reel follows");

    await page.click('[aria-label="Remove line 2"]');
    await page.waitForFunction(
      (before) => document.querySelectorAll(".pick textarea").length === before - 1,
      { timeout: 5000 },
      lineCount,
    );
    pass("a line can be removed");

    await clickButton(page, "Export");
    await page.waitForSelector(".final", { timeout: 300_000 });
    await new Promise((resolve) => setTimeout(resolve, 1200));
    const writtenVideo = await page.$eval(".final", (element) => {
      const final = element as HTMLVideoElement;
      return { width: final.videoWidth, height: final.videoHeight };
    });
    if (writtenVideo.width !== 1080 || writtenVideo.height !== 1920)
      throw new Error(`The written reel is ${writtenVideo.width}x${writtenVideo.height}.`);
    pass("the written reel exports tall");

    console.log(results.join("\n"));
    if (problems.length) {
      console.log(`\nProblems seen in the browser:\n  ${[...new Set(problems)].join("\n  ")}`);
      process.exitCode = 1;
    }
  } finally {
    awake?.kill();
    await browser.close();
    server.kill("SIGTERM");
    await new Promise((resolve) => setTimeout(resolve, 400));
    rmSync(home, { recursive: true, force: true });
  }
}

await main().catch((error: Error) => {
  console.log(results.join("\n"));
  console.error(`\nFAILED: ${error.message}`);
  if (error.cause) console.error(`Because: ${String(error.cause)}`);
  process.exitCode = 1;
});
