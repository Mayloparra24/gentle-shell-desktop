# Web host: diagrams

> Status: proposal. Companion to [README.md](README.md). Mermaid renders on GitHub.
>
> Legend: **solid** = exists today or was observed in the spike. **dashed** = planned, not built or not verified.

## 1. One UI, two hosts

The renderer and the chat domain are shared. Only the layer between them changes.

```mermaid
flowchart LR
  subgraph shared["Shared, unchanged"]
    UI["Renderer<br/>React UI"]
    BR["createBridge(ipc)<br/>GentleBridge"]
    RH["registerHandlers()"]
    DOM["ChatHost, PiSession,<br/>chat reducer, codec"]
  end

  subgraph electron["Host 1: Electron (today)"]
    PRE["preload<br/>ipcRenderer"]
    MAIN["src/main/index.ts<br/>BrowserWindow, ipcMain"]
  end

  subgraph web["Host 2: web (this proposal)"]
    WSC["client.ts<br/>WebSocket IPC"]
    SRV["server.ts<br/>HTTP + WebSocket"]
  end

  GS["gentle-shell --mode rpc<br/>(already installed)"]

  UI --> BR
  BR --> PRE --> MAIN --> RH
  BR --> WSC --> SRV --> RH
  RH --> DOM --> GS
```

Only `src/main/index.ts` and `src/main/ipc/registerHandlers.ts` import `electron`. The web host rebuilds the object graph of the first and reuses the second through small stand-ins.

## 2. One message, end to end

What happens when the user sends a prompt. Every arrow past the browser is the same call path the Electron app already uses.

```mermaid
sequenceDiagram
  autonumber
  participant B as Browser (UI)
  participant H as Web host
  participant C as ChatHost / PiSession
  participant G as gentle-shell --mode rpc

  B->>H: WebSocket upgrade (token, Origin, Host)
  H->>H: check token, exact Host, exact Origin
  alt any check fails
    H-->>B: 401 or 403, connection closed
  else all pass
    H-->>B: 101 Switching Protocols
  end
  B->>H: invoke chat.send { text }
  H->>C: sendMessage(text)
  C->>G: prompt (JSON line on stdin)
  G-->>C: events (JSON lines on stdout)
  C-->>H: ChatState updates
  H-->>B: push chat.state (streamed)
  B->>B: React re-renders the thread
```

## 3. Trust boundaries

Where untrusted input is, and what each boundary does.

```mermaid
flowchart TB
  subgraph untrusted["Untrusted"]
    PAGE["Any other web page<br/>open in the browser"]
    NET["Other machines on the network"]
  end

  subgraph browser["The user's browser"]
    APP["Gentle UI page<br/>holds the session"]
  end

  subgraph host["Local web host"]
    GATE["Gate<br/>127.0.0.1 only<br/>token + exact Host + exact Origin"]
    OPS["Typed operations only<br/>no argv, path or env from the page"]
  end

  subgraph local["User's machine"]
    CHILD["gentle-shell child<br/>user's credentials and files"]
  end

  PAGE -. "blocked: no token,<br/>foreign Origin" .-> GATE
  NET -. "blocked: not bound<br/>beyond loopback" .-> GATE
  APP --> GATE --> OPS --> CHILD
```

The residual risk is real: a local server in front of an agent with shell access. The gate is the whole defense, which is why it needs its own tests and an independent reviewer (slice 3).

## 4. Starting it

Token handling as the spike does it, and as planned.

```mermaid
sequenceDiagram
  autonumber
  actor U as User
  participant CLI as Command
  participant H as Web host
  participant B as Browser

  U->>CLI: run the command
  CLI->>H: start on 127.0.0.1, port chosen by the OS
  H->>H: generate a random 32-byte token
  H-->>CLI: listening
  CLI->>B: open http://127.0.0.1:port/?t=token
  B->>H: GET /?t=token
  H-->>B: the app page
  B->>B: remove the token from the address bar
  Note over B,H: Spike: the token stays valid and stays in browser history.
  rect rgba(240, 149, 200, 0.12)
    B-->>H: planned: exchange the token once for a session cookie
    H-->>B: planned: cookie, token no longer accepted
  end
```

## 5. Using an installed gentle-shell

The host does not install or change anything. It finds the launcher the user already has.

```mermaid
flowchart LR
  A["Start the host"] --> B{"GENTLE_SHELL_BIN set?"}
  B -- yes --> C["use that path"]
  B -- no --> D["look for gentle-shell on PATH"]
  D -- found --> E{"Windows .cmd shim?"}
  D -- not found --> X["clear error:<br/>install gentle-pi 3.7.0 or newer"]
  E -- yes --> F["run through the shell,<br/>one quoted command line<br/>(slice 1)"]
  E -- no --> G["spawn directly"]
  C --> H["spawn gentle-shell --mode rpc"]
  F --> H
  G --> H
```

Not shown: a version check against the installed `gentle-shell` at startup (audit A8). It is planned for slice 3.

## 6. Slices and what depends on what

```mermaid
flowchart LR
  S1["1. Windows spawn fix<br/>(done, own value)"]
  S2["2. Contract +<br/>WebSocket IPC client"]
  S3["3. Server: ws, cookie,<br/>child lifetime, auth tests"]
  S4["4. Renderer build +<br/>browser entry"]
  S5["5. CLI, docs, CI"]
  S6["6. Optional: gentle-shell web<br/>(needs gentle-shell maintainers)"]

  S1 --> S2
  S1 --> S4
  S2 --> S3
  S2 --> S4
  S3 --> S5
  S4 --> S5
  S5 -.-> S6
```

Slices 2 and 4 can be worked in parallel once slice 1 is in. Slice 3 is the critical and riskiest one.

## 7. Choices for where the code lives

```mermaid
flowchart TB
  Q{"Where does the web host live?"}
  A["A. Second entry point<br/>in gentle-shell-desktop<br/><b>recommended start</b>"]
  B["B. Separate repository<br/>consuming the UI as a package"]
  C["C. Inside gentle-shell<br/>not proposed"]

  Q --> A
  Q --> B
  Q --> C

  A --- A1["+ one test suite, no version matrix<br/>- needs maintainer agreement"]
  B --- B1["+ isolates the host's risk<br/>- two pipelines and a conformance job"]
  C --- C1["+ one install for the user<br/>- React and browser tests in the CLI repo"]
```
