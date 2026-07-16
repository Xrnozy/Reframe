# Reframe Development Roadmap

## Main Goal

Build one complete working path first:

1. Run `npx reframe`.
2. Open a supported local project.
3. Display the Reframe toolbar.
4. Select one element.
5. Change that element visually.
6. Update the real source file.
7. Restore the previous version.
8. Ask Codex to make one AI-assisted edit.

Do not begin with Design DNA, collaboration, multiple variations, reference adaptation, or advanced history features. Those features depend on the core browser-to-source pipeline working reliably.

---

# Phase 0 — Prepare the Development Environment

Before building Reframe itself, create two very small test projects.

## Test Project A: Vanilla Website

Create a simple project containing:

* `index.html`
* `style.css`
* `script.js`

The page should contain:

* Header
* Hero section
* Button
* Three cards
* Footer

Use simple IDs or data attributes on important elements.

This project will be the easiest place to test:

* Script injection
* Element selection
* CSS editing
* HTML editing
* Source mapping

## Test Project B: React JavaScript Project

Create a React and Vite project using JavaScript and JSX.

It should contain:

* `App.jsx`
* `Hero.jsx`
* `PricingCard.jsx`
* `Navbar.jsx`
* Plain CSS or Tailwind CSS

Do not use TypeScript.

Keep the components simple and avoid:

* Deeply nested components
* Complex state
* Dynamic server data
* Large component libraries
* Complicated routing

This React project will become the official Reframe demonstration repository.

## Initial Project Structure

Organize Reframe into three main areas:

```text
reframe/
├── packages/
│   ├── cli/
│   ├── dev-server/
│   └── browser-client/
├── demo/
│   ├── vanilla-demo/
│   └── react-demo/
└── package.json
```

### `cli`

Responsible for:

* Running `npx reframe`
* Detecting the project
* Starting processes
* Opening the browser
* Showing terminal messages

### `dev-server`

Responsible for:

* Connecting to the project
* Injecting the browser client
* Running the local WebSocket
* Reading and writing source files
* Managing Git checkpoints
* Calling Codex

### `browser-client`

Responsible for:

* Displaying the toolbar
* Selecting elements
* Previewing edits
* Sending edit requests
* Displaying confirmation and error states

---

# Phase 1 — Build the CLI Skeleton

## Goal

Make this command work:

```bash
npx reframe
```

At this stage, it does not need to understand the user’s project.

It only needs to:

1. Start a small local Node.js server.
2. Print a clear startup message.
3. Open a browser page.
4. Display a basic Reframe welcome screen.
5. Stop cleanly when the user presses `Ctrl+C`.

## Expected Terminal Output

```text
Reframe

✓ Reframe Dev Server started
✓ Browser opened

Reframe is running at:
http://localhost:4400

Press Ctrl+C to stop.
```

## Browser Page

The browser can initially show:

```text
Reframe

Your visual development environment is running.

Project detection is not available yet.
```

## What to Build

* Executable npm package
* Command entry point
* Local HTTP server
* Automatic browser opening
* Graceful shutdown
* Friendly error messages

## What Not to Build Yet

Do not add:

* Project detection
* WebSockets
* Toolbar injection
* Source mapping
* Git
* Codex
* Design DNA

## Completion Check

Phase 1 is complete when:

* The package can be run through `npx`.
* The browser opens automatically.
* The local page loads consistently.
* The process shuts down without leaving ports occupied.

---

# Phase 2 — Detect the Project and Start Its Development Server

## Goal

Run `npx reframe` from inside an existing project and automatically start that project.

## Project Detection Order

Start with only these supported project types:

1. Vanilla HTML/CSS/JavaScript
2. React with Vite using JavaScript/JSX
3. React with Tailwind CSS
4. React with plain CSS
5. React with CSS Modules

## Detection Process

When `npx reframe` runs, it should:

1. Read the current working directory.
2. Look for `package.json`.
3. Inspect dependencies and scripts.
4. Detect whether the project uses React and Vite.
5. Look for `index.html` when there is no framework.
6. Detect Tailwind through its package and configuration files.
7. Detect the project’s package manager using lockfiles.
8. Find the normal development command.

## Package Manager Detection

Use:

* `package-lock.json` → npm
* `pnpm-lock.yaml` → pnpm
* `yarn.lock` → Yarn
* `bun.lock` or `bun.lockb` → Bun

## Development Command Detection

For React/Vite, usually use the existing `dev` script.

For a Vanilla project with no development server, Reframe should provide its own static local server.

## Example Terminal Output

```text
Reframe

✓ Project detected: React + Vite
✓ Styling detected: Tailwind CSS
✓ Package manager: npm
✓ Development command: npm run dev
✓ Development server started at http://localhost:5173
```

## Unknown Command Handling

When Reframe cannot identify the command:

```text
Reframe could not determine how to start this project.

Available scripts:

1. npm run dev
2. npm run start
3. npm run serve

Choose a command:
```

Save the user’s selection in:

```text
.reframe/config.json
```

## What Not to Build Yet

Do not inject anything into the project page yet.

Only prove that Reframe can:

* Detect the project
* Start it
* Find its port
* Stop it safely

## Completion Check

Phase 2 is complete when:

* Reframe can start the Vanilla demo.
* Reframe can start the React/Vite demo.
* Reframe detects Tailwind.
* Both the Reframe process and project process stop together.
* Port conflicts are handled clearly.

---

# Phase 3 — Inject the Reframe Toolbar

## Goal

Display Reframe’s interface on top of the user’s actual local website without requiring a browser extension.

## Start With One Injection Method

For the first version, use a proxy approach.

The flow should be:

```text
Browser
↓
Reframe proxy
↓
User’s development server
```

Reframe receives the page HTML, inserts the browser-client script, and sends the modified HTML to the browser.

## Initial Toolbar

The first toolbar only needs:

```text
Reframe | Connected | Select | Exit
```

It should:

* Stay fixed at the top.
* Appear above the website.
* Avoid permanently modifying project files.
* Survive normal page refreshes.
* Avoid appearing in production builds.

## Browser Client Requirements

The injected browser client should:

* Use isolated styles.
* Avoid inheriting the website’s CSS.
* Use a high but controlled stacking level.
* Avoid changing the page layout unexpectedly.
* Add a small top offset only when necessary.
* Remove itself when Exit is clicked.

## Tailwind Consideration

Do not build the Reframe toolbar using classes that depend on the user’s Tailwind setup.

The toolbar should include its own isolated styles so the project cannot accidentally modify Reframe’s appearance.

## Completion Check

Phase 3 is complete when:

* The toolbar appears on the Vanilla demo.
* The toolbar appears on the React demo.
* The toolbar remains after Vite hot reload.
* The project files remain unchanged.
* Clicking Exit removes the editing interface.

---

# Phase 4 — Connect the Browser Client to the Local Server

## Goal

Allow the browser toolbar and Reframe Dev Server to communicate.

## Connection

Create a localhost-only WebSocket.

When the browser connects, it should send:

* Session token
* Current URL
* Current route
* Viewport width
* Viewport height
* Project identifier

The server should respond with:

* Connection accepted
* Project name
* Framework
* Supported features
* Current Reframe state

## First Test Message

Add a Test Connection button temporarily.

When clicked:

```text
Browser:
ping

Server:
pong
```

Display:

```text
✓ Reframe server connected
```

## Security Rules

The WebSocket should:

* Accept only localhost connections.
* Check the expected page origin.
* Require a random session token.
* Reject unrelated websites.
* Never allow the browser to send an arbitrary filesystem path.
* Allow only predefined message types.

## Initial Message Types

Keep the protocol small:

* `client:ready`
* `server:ready`
* `selection:changed`
* `preview:changed`
* `edit:apply`
* `edit:cancel`
* `server:error`

## Completion Check

Phase 4 is complete when:

* The browser connects automatically.
* Connection survives page refresh.
* The toolbar shows Connected or Disconnected accurately.
* Messages work in both directions.
* The server rejects an invalid token.

---

# Phase 5 — Select and Preview One Element

## Goal

Let the user select an element and make one browser-only visual change.

Start with **resize**, not move.

Resize is easier because moving elements can change component order and structure.

## Selection Mode

When Select is enabled:

1. Hovering over an element displays an outline.
2. A small label shows its tag or component name.
3. Clicking locks the selection.
4. The selected element receives resize handles.
5. The toolbar shows the selected element.

## Elements to Ignore

Do not allow selecting:

* The Reframe toolbar
* Script tags
* Style tags
* The document head
* Invisible elements
* Browser-native overlays
* Cross-origin iframe content

## First Supported Edit

Support width adjustment only.

For example:

```text
Current width: 320px

New width: 420px
```

During dragging:

* Update the element only in the browser.
* Do not touch the source file.
* Show Apply and Cancel.

## Explore Mode Foundation

This temporary preview is the beginning of Explore Mode.

### Apply

Sends the proposed edit to the Dev Server.

### Cancel

Restores the original browser style.

## Data Sent to the Server

Send:

* Element tag
* ID
* Class list
* Current text
* Parent summary
* Old width
* New width
* Route
* Viewport
* Temporary selector

## Completion Check

Phase 5 is complete when:

* The user can hover and select an element.
* Only one element is selected at a time.
* Width changes visually.
* Cancel restores the original state.
* Apply sends the edit request to the server.

---

# Phase 6 — Write the Edit to the Real Source File

## Goal

Make the browser edit permanently update the actual source code.

This is the most important phase.

## Build Vanilla Support First

Start with the Vanilla demo because source mapping is simpler.

Use explicit development metadata such as:

```text
data-reframe-source
data-reframe-line
```

These attributes should only exist during development.

For example, Reframe’s HTML transformation can attach source metadata before serving the page.

## Vanilla CSS Editing

For the first permanent edit, only support elements with a unique:

* ID
* Class
* Reframe source marker

When width changes, update the correct CSS rule.

Example:

```text
#pricing-card {
  width: 320px;
}
```

becomes:

```text
#pricing-card {
  width: 420px;
}
```

## Then Add React JSX Support

After Vanilla works, support simple React JSX components.

For the demo repository, add development-time source metadata during transformation.

The selected element should resolve to:

* Component name
* JSX source file
* Source location
* Styling method

## Tailwind Editing

For Tailwind projects, width changes should modify the relevant class.

Example:

```text
w-80
```

becomes:

```text
w-96
```

If there is no matching built-in utility, use an arbitrary Tailwind value:

```text
w-[420px]
```

Do not add inline styles unless the project already uses inline styles or the user explicitly chooses that behavior.

## Safe Mapping Rules

Only enable Apply when mapping is:

* Exact
* High confidence
* Limited to one source location

For ambiguous mappings:

```text
Reframe found multiple possible source locations.

[Choose Source] [Keep as Preview] [Cancel]
```

## File Change Process

Before writing:

1. Read the file again.
2. Confirm it has not changed unexpectedly.
3. Save the original content.
4. Apply the smallest possible change.
5. Write the file.
6. Wait for hot reload.
7. Verify the page still loads.
8. Roll back if the edit breaks the project.

## Completion Check

Phase 6 is complete when:

* Resizing a Vanilla element modifies its CSS file.
* The browser reloads and preserves the new width.
* Resizing a simple React element modifies JSX, CSS, or Tailwind correctly.
* Unsupported elements never receive unsafe edits.
* Broken edits can be rolled back.

This is the first truly convincing Reframe demo.

---

# Phase 7 — Add Git Checkpoints and Restore

## Goal

Make every accepted edit reversible.

## Git Requirements

Before enabling checkpoints:

1. Check whether the project is a Git repository.
2. Check for uncommitted user work.
3. Avoid mixing Reframe changes with unrelated changes.
4. Never push anything.

## Simplest Safe Hackathon Approach

Instead of creating normal visible commits after every edit, use a Reframe-managed history directory and Git patches first.

Store:

```text
.reframe/history/
└── <checkpoint-id>/
    ├── metadata.json
    ├── before.patch
    ├── after.patch
    └── screenshot.png
```

Later, you can add true Git commits or hidden Reframe branches.

This avoids filling the user’s normal Git history with automatic commits.

## Checkpoint Data

Save:

* Checkpoint ID
* Timestamp
* Edited file
* Old content hash
* New content hash
* Edit type
* Selected element
* Route
* Before screenshot
* After screenshot

## First History Interface

Only build:

* Previous
* Current
* Restore Previous

Do not build full visual branching yet.

## Restore Process

When Restore is selected:

1. Confirm the source file still matches the expected current version.
2. Create a safety checkpoint.
3. Restore the earlier file content or patch.
4. Wait for the project to reload.
5. Confirm restoration succeeded.
6. Update the toolbar state.

## Completion Check

Phase 7 is complete when:

* Every accepted edit creates a checkpoint.
* The user can restore the previous source version.
* The browser updates correctly.
* Existing unrelated user work is preserved.
* No remote Git action occurs.

---

# Phase 8 — Add One AI-Assisted Edit

## Goal

Allow the user to select one element, type one instruction, and let Codex modify the real source.

Do not support general project generation yet.

## First AI Edit Type

Use one focused request:

> Make this card more visually prominent while preserving the current design.

This request should allow Codex to change:

* Spacing
* Border
* Background
* Typography
* Tailwind classes
* Plain CSS

It should not add:

* Backend logic
* New packages
* New routes
* Authentication
* External APIs

## Minimal Element Context Packet

Send:

* Selected element screenshot
* Surrounding section screenshot
* Component or element name
* Source file
* Relevant source snippet
* Current classes
* Current computed styles
* Current route
* Framework
* Styling method
* User instruction

Do not send the entire repository.

## Authentication

For development, use the user’s local API key.

For the hackathon demonstration:

* Use Demo mode when available.
* Otherwise show the AI edit in the video.
* Keep all non-AI features runnable without a key.

## AI Edit Flow

1. User selects the element.
2. User clicks Generate.
3. User enters the instruction.
4. Reframe creates a pre-generation checkpoint.
5. Reframe builds the Element Context Packet.
6. Reframe sends it to Codex.
7. Codex returns a proposed change or diff.
8. Reframe validates the files and allowed scope.
9. Reframe applies the proposed change.
10. The project reloads.
11. Reframe displays Accept, Refine, Compare, and Reject.

## Accept

* Saves the result.
* Creates a checkpoint.
* Captures screenshots.

## Reject

* Restores the pre-generation version.

## Refine

Send a follow-up instruction with the current result as context.

## Completion Check

Phase 8 is complete when:

* One selected element can be changed through a prompt.
* Only relevant files are modified.
* The change appears through hot reload.
* The user can accept or reject it.
* Rejection restores the original source.

---

# Phase 9 — Add Basic Design DNA

Build Design DNA only after the complete editing pipeline works.

## Start Small

Initially detect only:

* Main colors
* Font families
* Common font sizes
* Common spacing values
* Border radii
* Tailwind theme values
* Reusable React component names

Store:

```text
.reframe/design-dna/
├── DESIGN.md
├── tokens.json
├── components.json
└── fingerprint.json
```

## First Design DNA Behavior

Before an AI request, include:

* Approved colors
* Approved spacing
* Existing component names
* Basic design rules

Do not build full drift detection yet.

## Completion Check

* Design DNA can be generated.
* The user can review it.
* AI prompts receive the relevant rules.
* Generated changes avoid unrelated colors and styles.

---

# Phase 10 — Add the Visual Time Machine

Build the memorable interaction after checkpoints and screenshots already work.

## First Version

Add a floating button:

```text
Hold to view previous
```

When held:

* Display the previous screenshot as an overlay.

When released:

* Return to the current live page.

When clicked:

* Open a basic history list.

Do not switch Git versions continuously during hover.

Use screenshots for immediate comparison.

---

# Phase 11 — Add Async Comments

After element anchoring is reliable, add local comments.

Store one annotation per file:

```text
.reframe/annotations/<annotation-id>.json
```

Support:

* Pin
* Comment
* Highlight
* Resolve
* Reopen

Git push and Git pull remain the synchronization mechanism.

Do not build:

* Real-time cursors
* Accounts
* Cloud backend
* Team presence

---

# Recommended Hackathon Scope

## Must Work

These should be polished:

1. `npx reframe`
2. React/Vite and Vanilla project detection
3. Tailwind detection
4. Toolbar injection
5. WebSocket connection
6. Element selection
7. One resize edit
8. Real source-file update
9. Checkpoint
10. Restore
11. One Codex-assisted edit
12. Accept or reject

## Good to Include

Include these only after the core is stable:

* Basic Design DNA
* Previous screenshot comparison
* One visual comment
* Tailwind-aware color editing

## Do Not Prioritize Yet

Do not spend early development time on:

* Visual branching
* Multiple design variations
* Full Design Critic
* Reference adaptation
* New-project scaffolding
* Desktop launcher
* Full responsive editor
* Full collaboration system
* Design-drift detection
* Advanced AI Inspector
* TypeScript support
* Vue, Angular, Svelte, or Next.js support

---

# Best Development Order

```text
CLI
↓
Project detection
↓
Start development server
↓
Inject browser client
↓
WebSocket communication
↓
Element selection
↓
Browser-only preview
↓
Source mapping
↓
Real source edit
↓
Checkpoint
↓
Restore
↓
Codex edit
↓
Basic Design DNA
↓
Visual Time Machine
↓
Async comments
```

---

# Your First Winning Milestone

Your first major milestone should be this exact demonstration:

1. Open the React JavaScript demo project.
2. Run `npx reframe`.
3. Browser opens automatically.
4. Select a pricing card.
5. Resize it.
6. Click Apply.
7. Show the Tailwind or CSS source changing.
8. Refresh the page.
9. The edit remains.
10. Click Restore.
11. The source and browser return to their original state.

Once that works reliably, the hardest and most important Reframe workflow is proven.

Afterward, add the Codex prompt:

> Make this pricing card emphasize the annual plan while preserving the existing design.

The browser updates, the real source changes, and the user can reject or accept it.

That complete sequence is the foundation of the entire Reframe product.
