import { useCallback, useEffect, useRef, useState } from "react";
import { api, type Service, type Connections as Status, type Task } from "../api";

interface Props {
  /** The reel that's open, which can be handed to an assistant. */
  jobId: string | null;
  onClose(): void;
  /** Called after any change, so the app picks up what each job now uses. */
  onChanged(): void;
}

// "U‑Cut" uses a non-breaking hyphen, so it never splits across lines on a phone.
const name = "U‑Cut";

const rows: { task: Task; legend: string; builtIn: string; stays: string }[] = [
  {
    task: "write",
    legend: "Write scripts with",
    builtIn: name,
    stays: `${name} writes from its own patterns, on this computer.`,
  },
  {
    task: "voice",
    legend: "Read aloud with",
    builtIn: "This computer",
    stays: "The voice runs on this computer, so nothing leaves it.",
  },
  {
    task: "listen",
    legend: "Listen to recordings with",
    builtIn: "This computer",
    stays: "Listening runs on this computer, so nothing leaves it.",
  },
];

const builtInIds: Record<Task, string> = { write: "rules", voice: "kokoro", listen: "whisper" };

const claudeCode = (launcher: string) => `claude mcp add --scope user u-cut -- ${launcher} mcp`;
const anyAssistant = (launcher: string) =>
  `{ "mcpServers": { "u-cut": { "command": "${launcher}", "args": ["mcp"] } } }`;

/** Where a problem happened, so it's shown beside the thing it's about. */
type Place = Task | "assistant" | "connected";

function CopyLine({ label, text }: { label: string; text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="copy-line">
      <span>{label}</span>
      <code>{text}</code>
      <button
        type="button"
        className="button-quiet"
        aria-label={`Copy ${label.toLowerCase()}`}
        onClick={() => {
          void navigator.clipboard?.writeText(text).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
          });
        }}
      >
        {copied ? "Copied" : "Copy"}
      </button>
      <span className="visually-hidden" aria-live="polite">
        {copied ? `${label} copied` : ""}
      </span>
    </div>
  );
}

function KeyForm({
  service,
  problem,
  onConnect,
  onCancel,
}: {
  service: Service;
  problem: string | null;
  onConnect(key: string): Promise<void>;
  onCancel(): void;
}) {
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const errorId = `key-problem-${service.id}`;
  return (
    <form
      className="key-form"
      onSubmit={(event) => {
        event.preventDefault();
        setBusy(true);
        void onConnect(key).finally(() => setBusy(false));
      }}
    >
      <label>
        <span>{service.name} key</span>
        <input
          type="password"
          value={key}
          autoComplete="off"
          spellCheck={false}
          // biome-ignore lint/a11y/noAutofocus: the field is the only thing this panel is for.
          autoFocus
          placeholder="Paste it here"
          aria-invalid={problem ? true : undefined}
          aria-describedby={problem ? errorId : undefined}
          onChange={(event) => setKey(event.target.value)}
        />
      </label>
      <button type="submit" className="button-solid" disabled={!key.trim() || busy}>
        {busy ? "Checking" : "Connect"}
      </button>
      {service.keyUrl ? (
        <a className="button-quiet" href={service.keyUrl} target="_blank" rel="noreferrer">
          Get a key
        </a>
      ) : null}
      <button type="button" className="button-quiet" onClick={onCancel}>
        Not now
      </button>
      {problem ? (
        <p className="connections-problem" id={errorId} role="alert">
          {problem}
        </p>
      ) : null}
    </form>
  );
}

export function Connections({ jobId, onClose, onChanged }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [problem, setProblem] = useState<{ at: Place; text: string } | null>(null);
  const [asking, setAsking] = useState<{ task: Task; service: Service } | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  const [leaving, setLeaving] = useState<string | null>(null);

  // Focus starts on the title, and goes back where it was when the sheet closes.
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    const sheet = dialog.current;
    sheet?.showModal();
    heading.current?.focus();
    return () => {
      sheet?.close();
      before?.focus?.();
    };
  }, []);

  const refresh = useCallback(async () => {
    try {
      const next = await api.connections();
      setStatus(next);
      return next;
    } catch (error) {
      setProblem({ at: "connected", text: (error as Error).message });
      return null;
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const apply = async (at: Place, work: Promise<Status>) => {
    setProblem(null);
    try {
      setStatus(await work);
      onChanged();
      return true;
    } catch (error) {
      setProblem({ at, text: (error as Error).message });
      return false;
    }
  };

  const focusChoice = (task: Task, id: string) => {
    requestAnimationFrame(() => {
      document.querySelector<HTMLElement>(`[data-choice="${task}-${id}"]`)?.focus();
    });
  };

  const pick = (task: Task, id: string) => {
    setProblem(null);
    const service = status?.services.find((entry) => entry.id === id);
    if (asking?.task === task && asking.service.id === id) {
      setAsking(null);
      return;
    }
    if (!service || service.connected) {
      setAsking(null);
      void apply(task, api.choose({ [task]: id }));
    } else {
      setAsking({ task, service });
    }
  };

  const chooseNow = async (task: Task, id: string) => {
    if (await apply(task, api.choose({ [task]: id }))) {
      setAsking(null);
      focusChoice(task, id);
    }
  };

  const handOver = async () => {
    if (!jobId) return;
    try {
      setLink((await api.assistantLink(jobId)).link);
      requestAnimationFrame(() => {
        document.querySelector<HTMLElement>(".handoff .copy-line button")?.focus();
      });
    } catch (error) {
      setProblem({ at: "assistant", text: (error as Error).message });
    }
  };

  /** Starts Voice Studio, then looks for it each second for up to ten seconds. */
  const openStudio = async (task: Task) => {
    setOpening(true);
    setProblem(null);
    try {
      await api.openVoiceStudio();
      for (let tries = 0; tries < 10; tries += 1) {
        await new Promise((done) => setTimeout(done, 1000));
        const next = await refresh();
        if (next?.voiceStudio?.running) return;
      }
      setProblem({
        at: task,
        text: "Voice Studio didn't open. Open it from Applications, then choose Check again.",
      });
    } catch (error) {
      setProblem({ at: task, text: (error as Error).message });
    } finally {
      setOpening(false);
    }
  };

  const problemAt = (at: Place) =>
    problem?.at === at ? (
      <p className="connections-problem" role="alert">
        {problem.text}
      </p>
    ) : null;

  const studio = status?.voiceStudio;
  const launcher = status?.launcher ?? "ucut";

  return (
    <dialog
      ref={dialog}
      className="sheet connections"
      aria-labelledby="connections-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="connections-body">
        <header className="connections-head">
          <h2 id="connections-title" ref={heading} tabIndex={-1}>
            Connections
          </h2>
          <button type="button" className="button-quiet" onClick={onClose}>
            Done
          </button>
        </header>

        {!status ? (
          <p>{problem?.text ?? "Looking at what's set up…"}</p>
        ) : !status.local ? (
          <p>
            The person running {name} chooses its connections. Reels made here use {name}'s own
            voice and listening, so nothing you add leaves their computer.
          </p>
        ) : (
          <>
            <p className="connections-lede">
              {name} already writes, reads aloud and listens on this computer. To use a service you
              have, choose it below. Nothing changes until you do.
            </p>

            {rows.map((row) => {
              const choice = status.choices[row.task];
              const options = status.services.filter((service) => service.tasks.includes(row.task));
              const current = options.find((service) => service.id === choice);
              const asked = asking?.task === row.task ? asking.service : null;
              const panelId = `connect-${row.task}`;
              return (
                <fieldset className="choice connections-row" key={row.task}>
                  <legend>{row.legend}</legend>
                  <div>
                    <button
                      type="button"
                      data-choice={`${row.task}-${builtInIds[row.task]}`}
                      aria-pressed={choice === builtInIds[row.task]}
                      onClick={() => pick(row.task, builtInIds[row.task])}
                    >
                      {row.builtIn}
                    </button>
                    {options.map((service) =>
                      service.connected ? (
                        <button
                          type="button"
                          key={service.id}
                          data-choice={`${row.task}-${service.id}`}
                          aria-pressed={choice === service.id}
                          onClick={() => pick(row.task, service.id)}
                        >
                          {service.name}
                        </button>
                      ) : (
                        <button
                          type="button"
                          key={service.id}
                          data-choice={`${row.task}-${service.id}`}
                          aria-expanded={asked?.id === service.id}
                          aria-controls={panelId}
                          onClick={() => pick(row.task, service.id)}
                        >
                          {service.name}
                        </button>
                      ),
                    )}
                  </div>
                  <p className="connections-sends">
                    {asked ? asked.sends[row.task] : (current?.sends[row.task] ?? row.stays)}
                  </p>
                  {asked ? (
                    <div className="connections-ask" id={panelId}>
                      {asked.id === "voicestudio" ? (
                        !studio?.installed ? (
                          <div className="connections-actions">
                            <p>
                              Voice Studio is a free app that makes voices on your computer,
                              including your own, and can listen to recordings too.{" "}
                              <a href="https://voicestudio.sh" target="_blank" rel="noreferrer">
                                Get Voice Studio
                              </a>
                            </p>
                            <button
                              type="button"
                              className="button-quiet"
                              onClick={() => void refresh()}
                            >
                              Check again
                            </button>
                            <button
                              type="button"
                              className="button-quiet"
                              onClick={() => setAsking(null)}
                            >
                              Not now
                            </button>
                          </div>
                        ) : !studio.running ? (
                          <div className="connections-actions">
                            <p>Voice Studio is on this computer, but it isn't open.</p>
                            <button
                              type="button"
                              className="button-outline"
                              disabled={opening}
                              onClick={() => void openStudio(row.task)}
                            >
                              {opening ? "Opening Voice Studio…" : "Open Voice Studio"}
                            </button>
                            <button
                              type="button"
                              className="button-quiet"
                              onClick={() => void refresh()}
                            >
                              Check again
                            </button>
                          </div>
                        ) : (
                          <div className="connections-actions">
                            <p>
                              {row.task === "voice"
                                ? `${name} will see the voices you've made in Voice Studio, including your own, and send it your script to read.`
                                : `${name} will send your recordings' sound to Voice Studio to be written down.`}{" "}
                              It all stays on this computer.
                            </p>
                            <button
                              type="button"
                              className="button-solid"
                              onClick={() => {
                                void apply(row.task, api.allowVoiceStudio(true)).then((ok) => {
                                  if (ok) void chooseNow(row.task, "voicestudio");
                                });
                              }}
                            >
                              Allow and use Voice Studio
                            </button>
                            <button
                              type="button"
                              className="button-quiet"
                              onClick={() => setAsking(null)}
                            >
                              Not now
                            </button>
                          </div>
                        )
                      ) : (
                        <KeyForm
                          service={asked}
                          problem={problem?.at === row.task ? problem.text : null}
                          onCancel={() => setAsking(null)}
                          onConnect={async (key) => {
                            if (await apply(row.task, api.connect(asked.id, key))) {
                              await chooseNow(row.task, asked.id);
                            }
                          }}
                        />
                      )}
                      {asked.id === "voicestudio" ? problemAt(row.task) : null}
                    </div>
                  ) : (
                    problemAt(row.task)
                  )}
                </fieldset>
              );
            })}

            {status.services.some((service) => service.connected) ? (
              <section className="connections-section" aria-labelledby="connected-title">
                <h3 id="connected-title">Connected</h3>
                <ul className="connections-list">
                  {status.services
                    .filter((service) => service.connected)
                    .map((service) => (
                      <li key={service.id}>
                        {leaving === service.id ? (
                          <>
                            <span>
                              Disconnect {service.name}? Anything using it goes back to this
                              computer.
                            </span>
                            <button
                              type="button"
                              className="button-quiet"
                              onClick={() => {
                                setLeaving(null);
                                void apply("connected", api.disconnect(service.id)).then(() => {
                                  heading.current?.focus();
                                });
                              }}
                            >
                              Disconnect
                            </button>
                            <button
                              type="button"
                              className="button-quiet"
                              onClick={() => setLeaving(null)}
                            >
                              Keep
                            </button>
                          </>
                        ) : (
                          <>
                            <span>{service.name}</span>
                            <span className="connections-key">
                              {service.keyEnding
                                ? `Key ending ${service.keyEnding}`
                                : "On this computer"}
                            </span>
                            <button
                              type="button"
                              className="button-quiet"
                              onClick={() => setLeaving(service.id)}
                            >
                              Disconnect
                            </button>
                          </>
                        )}
                      </li>
                    ))}
                </ul>
                <p className="connections-note">
                  Keys stay on this computer and never reach your browser.
                </p>
                {problemAt("connected")}
              </section>
            ) : (
              problemAt("connected")
            )}

            <section className="connections-section" aria-labelledby="assistant-title">
              <h3 id="assistant-title">Your assistant</h3>
              <p>
                Let Claude Code, Claude Desktop, Cursor or another assistant make and change reels.
                Add {name} to it once:
              </p>
              <CopyLine label="Claude Code" text={claudeCode(launcher)} />
              <details className="connections-more">
                <summary>Other assistants</summary>
                <CopyLine label="MCP settings" text={anyAssistant(launcher)} />
              </details>
              {jobId ? (
                link ? (
                  <div className="handoff">
                    <p>
                      Paste this into your assistant. The link works on this computer for a day.
                    </p>
                    <CopyLine
                      label="Message to paste"
                      text={`Use the u-cut tools to open my reel at ${link} with app_reel. Ask me what I'd like to change, then send the changes with app_change.`}
                    />
                  </div>
                ) : (
                  <button type="button" className="button-outline" onClick={() => void handOver()}>
                    Give this reel to your assistant
                  </button>
                )
              ) : null}
              {problemAt("assistant")}
            </section>
          </>
        )}
      </div>
    </dialog>
  );
}
