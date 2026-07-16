# Reframe — Product Specification

## 1. Product Overview

### 1.1 Product name

**Reframe**

### 1.2 Product definition

Reframe is an AI-native visual development environment that allows developers to edit a running local website directly in the browser while keeping every approved change connected to the real project source code.

Reframe consists of:

- An injected browser client that adds Reframe’s visual editing interface to the user’s local website without requiring a browser extension.
- A local JavaScript-based Reframe Dev Server that runs inside the project, starts or connects to the normal development server, injects the browser client, maps rendered elements to source files, writes approved changes, manages local history, and communicates with Codex.
- A project-level Design DNA system that records the application’s visual language, reusable components, responsive behavior, page conventions, and design rules.
- A Codex integration that receives structured browser context rather than only a prompt or CSS selector.
- A local visual history system that records screenshots, prompts, file changes, Design DNA versions, and local Git checkpoints.

Reframe is not intended to replace the developer’s repository, framework, or source-control workflow. It is intended to make browser-based interface editing feel as direct as a visual design tool while still producing maintainable changes in the actual codebase.

### 1.3 Core product promise

The browser becomes an intelligent visual interface for the real codebase.

A developer should be able to select an element on a running localhost page, change it visually, describe a structural change in natural language, preview alternatives, inspect the source relationship, and restore an earlier design without manually switching between the browser, DevTools, VS Code, and Git for every small task.

### 1.4 Primary differentiator

Reframe must not behave like a generic website builder that generates isolated HTML or edits only the rendered Document Object Model.

Its main differentiator is the connection between:

- What the user sees in the browser.
- Where that interface is defined in the source repository.
- The project’s existing design rules.
- The user’s selected Codex conversation.
- The project’s visual history.
- The intent behind the requested change.

Reframe should translate a visual action into the context Codex or the Reframe Dev Server needs to modify the correct source files safely.

---

## 2. Product Goals

Reframe should:

1. Let developers visually edit a real running website without losing the connection to source code.
2. Preserve the project’s existing design language by default.
3. Give Codex structured, relevant, visual, and repository-aware context.
4. Separate simple deterministic edits from structural AI-assisted edits.
5. Let users experiment without immediately changing source files.
6. Make every accepted visual change reviewable and reversible.
7. Create a durable design contract that can be reused by future Codex conversations and contributors.
8. Make source mapping, responsive behavior, and component reuse visible to the user.
9. Reduce accidental design drift caused by repeated AI generation.
10. Make the project impressive as a live demonstration while still being technically credible and useful.
11. Let a beginner start the product through one command or a folder-based launcher without understanding package scripts or development-server configuration.

---

## 3. Non-Goals

Reframe should not:

- Become a full replacement for VS Code.
- Replace Git hosting platforms or push changes automatically.
- Generate a completely separate website outside the user’s repository.
- Edit production websites directly.
- Silently modify a repository without an explicit user action.
- Treat every drag, click, or style adjustment as a Codex request.
- Clone reference designs without allowing the user to control what is borrowed.
- Invent a new design system when the project already has one, unless the user explicitly requests a redesign.
- Hide uncertainty when an element cannot be mapped reliably to source code.
- Claim that a visual change is safe when the source mapping is ambiguous.
- Automatically rewrite Design DNA whenever the repository changes.
- Depend on a specific frontend framework for the entire product concept.
- Require a browser extension, VS Code extension, native messaging bridge, or proprietary IDE.
- Attach to arbitrary production websites that were not started or configured through Reframe.
- Include multi-model comparison.
- Include an AI animation generator.

---

## 4. Target Users

### 4.1 Primary users

- Frontend developers working on React, Vue, Next.js, Vite, or similar web projects.
- Full-stack developers who want faster interface iteration.
- Hackathon teams building or redesigning interfaces under time pressure.
- Developers who understand code but prefer direct visual feedback for layout and styling.
- Designers who collaborate closely with developers and need their visual changes converted into real source changes.

### 4.2 Secondary users

- Product engineers reviewing design alternatives.
- Technical founders building early product interfaces.
- Open-source contributors learning an unfamiliar design system.
- Teams maintaining a large component library or design system.
- Developers using Codex across multiple conversations in the same repository.

---

## 5. Product Principles

### 5.1 Source code remains the truth

The rendered page is the editing surface, but the repository is the permanent source of truth.

### 5.2 Preserve before redesign

Reframe should preserve the project’s current Design DNA unless the user explicitly requests a redesign or approves a new rule.

### 5.3 Preview before permanent change

Visual changes should be previewed and reviewed before they become permanent source changes whenever the edit is not fully deterministic.

### 5.4 Context should be focused

Codex should receive the information necessary to understand the selected element and project without sending unrelated repository content.

### 5.5 Every accepted change should be reversible

Accepted changes should create enough history to compare, restore, and understand what changed.

### 5.6 Ambiguity must be visible

When Reframe is uncertain about the source component, responsive consequences, or project detection, it should show the uncertainty rather than guessing silently.

### 5.7 The developer remains in control

The user should be able to approve, reject, refine, restore, choose a conversation, update Design DNA, and decide whether experimental changes enter the repository.

---

## 6. High-Level System

### 6.1 One-command startup

Reframe should be started from the project folder with one primary command:

`npx reframe`

That single command should:

- Detect the project type.
- Detect the package manager.
- Detect the normal development command.
- Start or attach to the project’s development server.
- Start the local Reframe Dev Server.
- Inject the Reframe browser client into the local website.
- Open the correct localhost URL in the default browser.
- Load or create Design DNA.
- Prepare local visual history.
- Display a clear ready state.

Users should not be required to run a separate initialization command, install a browser extension, install a VS Code extension, manually copy ports, or configure native messaging.

Advanced commands may exist for debugging or framework-specific configuration, but they must not be part of the normal onboarding path.

### 6.2 Beginner launcher

For people who do not know how to use a terminal, Reframe should also provide a simple launcher with Open Existing Project, Create New Project, Select Project Folder, and Start Reframe actions.

The launcher should perform the same workflow as `npx reframe` and use the same local engine.

### 6.3 Injected browser client

The injected browser client is responsible for:

- Rendering the Reframe top bar and floating controls.
- Entering and exiting Design Mode.
- Highlighting and selecting elements.
- Applying temporary Explore Mode changes.
- Capturing visual context.
- Sending user actions to the local Reframe Dev Server through a local WebSocket.
- Displaying generation progress, review states, Design DNA status, visual comparison, and history.
- Reconnecting after normal hot reloads.
- Running only on the local project started or configured through Reframe.

### 6.4 Reframe Dev Server

The Reframe Dev Server is a local Node.js process responsible for:

- Detecting the project root, framework, package manager, and development command.
- Starting or attaching to the normal development server.
- Injecting the browser client through framework adapters, middleware, or HTML transformation.
- Mapping rendered elements to source files and components.
- Reading and safely modifying project files.
- Creating and maintaining Design DNA.
- Updating AGENTS.md guidance.
- Preparing Element Context Packets.
- Communicating with Codex.
- Applying approved direct and AI-assisted edits.
- Watching build, type, and browser errors.
- Creating local Git checkpoints and restoring them.
- Detecting design drift.
- Protecting uncommitted work.

### 6.5 Local connection security

The browser client and Reframe Dev Server should communicate through a localhost-only WebSocket or equivalent channel using a random session token and origin checks.

The browser client must never receive unrestricted filesystem access.

### 6.6 Development-server integration

Reframe should wrap, proxy, or integrate with the project’s existing development server rather than replacing it. Hot reload, routing, environment loading, plugins, source maps, and existing error overlays should continue to work.

### 6.7 Local project data

Reframe should maintain Design DNA, configuration, and visual-history metadata locally. Nothing should be pushed automatically.

### 6.8 Codex relationship

Codex handles structural and repository-aware changes. Reframe should disclose context, changed files, validation results, and Design DNA conflicts.

Reframe should not depend on a proprietary IDE. Developers may keep VS Code open, but VS Code is not required for connection or file writing.


### 6.9 Codex authentication

Reframe must support two operating modes:

**Local mode**
- The user supplies their own OpenAI API key.
- The key is stored locally using the operating system's secure credential storage.
- The key is never committed into the repository.

**Demo mode**
- For hackathon demonstrations, Reframe may use a project-controlled, rate-limited relay so judges can experience AI-assisted editing without creating an account or entering an API key.
- If Demo mode is unavailable, Reframe must clearly indicate that AI-assisted editing is demonstrated through the provided video while all local editing features remain fully runnable.

Reframe must never promise account-free AI editing unless Demo mode is available.


---

## 7. End-to-End User Journey

### 7.1 Existing project: one-command flow

1. The user opens a terminal in the project folder, or selects the folder in the Reframe launcher.
2. The user runs `npx reframe`, or clicks Start Reframe.
3. Reframe detects the package manager, framework, development command, and project root.
4. Reframe starts the project’s development server and local Reframe Dev Server.
5. Reframe injects the browser client.
6. Reframe opens the local website automatically.
7. The user enters Design Mode and starts editing.

The user should not need to install browser or editor extensions, pair the browser with an IDE, enter a port manually, or understand npm scripts.

### 7.2 Terminal experience

The terminal should show plain-language progress: project detected, server started, Design DNA loaded, browser opened, and ready to design. Technical logs belong behind a verbose option.

### 7.3 Browser ready state

The page should show the project name, framework, local address, Design DNA status, Start Designing, History, and Settings.

### 7.4 Startup states

Reframe should clearly handle Ready, unknown development command, development-server failure, port conflict, partial framework support, and disconnected browser client states.

### 7.5 New project flow

A beginner should be able to choose Create New Project from the launcher or run `npx reframe new`. Reframe should ask what they want to build before asking technical framework questions, then scaffold, start, and open the project.

### 7.6 Judge and evaluator flow

A judge should be able to clone or download the demo repository, run `npx reframe`, wait for the browser to open, perform a direct edit, request a Codex edit, inspect the real changed file, and restore an earlier design without browser-extension installation. If Demo mode is enabled, no API key is required. Otherwise the AI-editing portion is demonstrated through the submission video while Direct Edit, Explore Mode, Design DNA, and Visual Time Machine remain fully runnable.


---

## 8. First-Time Project Setup

## 8.1 Setup purpose

The first-time setup prepares the project for safe visual editing.

Reframe should explain that it will:

- Analyze the current design.
- Discover reusable components.
- Record page and responsive conventions.
- Create the project’s Design DNA.
- Prepare local visual history.
- Add or update Codex repository guidance.
- Avoid pushing anything to remote Git.

## 8.2 Explicit user action

The first `npx reframe` run should ask for permission before writing Design DNA, AGENTS.md guidance, or local history metadata. The user may begin in limited preview mode before approval.

Reframe should not silently scan and write project files immediately after installation.

## 8.3 Analysis performance

The first analysis should prioritize fast startup.

- A typical demo project should complete initial analysis within approximately 30 seconds.
- Large repositories may perform incremental background analysis after the user has already entered Design Mode.
- Reframe should never block editing while optional analysis continues.
- The official demonstration repository should ship with a pre-generated Design DNA so judges experience an immediate startup.

## 8.4 Analysis scope

The analysis may inspect:

- Global styles.
- CSS modules.
- Utility-framework configuration.
- Theme configuration.
- CSS variables.
- Font imports.
- Shared layout components.
- Reusable UI components.
- Route structure.
- Representative pages.
- Responsive breakpoints.
- Component variants.
- Existing design documentation.
- Existing AGENTS.md guidance.
- Representative screenshots generated from localhost.

## 8.5 Setup results

After analysis, Reframe should summarize findings such as:

- Number of colors detected.
- Number of typography styles.
- Number of reusable components.
- Dominant spacing pattern.
- Number of page-layout patterns.
- Number of responsive breakpoints.
- Any uncertainty or conflicting design patterns.

The user can:

- Review Design DNA.
- Start Designing.
- Re-run analysis.
- Skip optional detected rules.
- Mark incorrect detections.

## 8.6 Existing repository guidance

If AGENTS.md already exists, Reframe should preserve it.

Reframe may add a clearly separated Design System section, but it should not:

- Replace unrelated instructions.
- Rewrite the entire file.
- Delete existing rules.
- Change project commands.
- Change contributor instructions.

---

## 9. Design DNA

## 9.1 Purpose

Design DNA is a versioned design contract that records how the current project looks, behaves, and organizes reusable interface patterns.

It is shared by:

- The injected browser client.
- The Reframe Dev Server.
- Codex.
- The developer.
- Future contributors.
- Future Codex conversations.

It should be useful even outside the immediate Reframe session.

## 9.2 Design DNA contents

Design DNA should save:

- Colors and their semantic roles.
- Typography hierarchy.
- Font families and permitted usage.
- Font-size patterns.
- Font-weight patterns.
- Line-height conventions.
- Spacing scale and common layout gaps.
- Border radii.
- Border widths and styles.
- Shadow conventions.
- Surface and elevation patterns.
- Existing reusable components.
- Component variants.
- Page-width conventions.
- Container behavior.
- Section spacing.
- Responsive breakpoints.
- Mobile and desktop layout behavior.
- Navigation patterns.
- Form density.
- Button hierarchy.
- Card conventions.
- Icon usage.
- Image treatment.
- Accessibility-related visual rules.
- Screenshots of important sections.
- Approved design references.
- Natural-language design rules.

## 9.3 Human-editable design rules

Users must be able to review, add, correct, disable, and remove natural-language rules.

Examples of supported rules include:

- Purple is used only for primary actions.
- Cards always use a 16-pixel radius.
- Do not use gradients.
- Marketing headings use the display font.
- Forms use compact spacing.

Reframe should distinguish between:

- Detected rules.
- User-confirmed rules.
- User-created rules.
- Deprecated rules.
- Rules currently in conflict with the repository.

## 9.4 Structured design data

Design DNA should include structured data that Reframe and Codex can consume consistently.

The structured data should support:

- Semantic token names.
- Raw token values.
- Source locations.
- Confidence.
- Usage examples.
- Component relationships.
- Responsive variants.
- Last verified version.
- User approval status.

## 9.5 AGENTS.md integration

Reframe should add a concise Design System section to the repository’s AGENTS.md.

That section should instruct Codex to:

- Read the Design DNA overview before modifying UI.
- Use the project’s saved tokens.
- Reuse existing components.
- Preserve the existing design unless a redesign is explicitly requested.
- Avoid unrelated colors, fonts, spacing systems, and component patterns.

The generated guidance should reference the actual Design DNA paths used by the project.

## 9.6 Design DNA review interface

The review interface should allow users to inspect:

- Colors.
- Typography.
- Spacing.
- Components.
- Pages.
- Responsive behavior.
- Natural-language rules.
- Reference materials.
- Version history.
- Drift warnings.

Users should be able to mark a detected item as:

- Correct.
- Incorrect.
- Intentional exception.
- Deprecated.
- Needs review.

## 9.7 Design DNA trust requirements

Design DNA should never be presented as unquestionably correct.

Reframe should show:

- Detection confidence where useful.
- Source evidence.
- Example component usage.
- Screenshot examples.
- Conflicts between different areas of the project.
- Whether a rule is confirmed by the user.

---

## 10. Design-Drift Detection

## 10.1 Purpose

Design DNA may become stale as developers continue changing the project outside Reframe.

Reframe must detect when the saved design contract no longer matches the repository.

## 10.2 Fingerprint inputs

The design fingerprint should consider:

- CSS and utility-framework configuration.
- Theme files.
- CSS variables.
- Font imports.
- Shared components.
- Reusable component variants.
- Global style files.
- Route-level layouts.
- Representative screenshots.
- Approved Design DNA rules.
- Page-width and responsive conventions.

## 10.3 Design status

Reframe should display a simple status:

- Current.
- May be outdated.
- Review required.
- Analysis unavailable.

## 10.4 Drift summary

When drift is detected, Reframe should summarize:

- Number of component files changed.
- Number of new colors.
- Number of removed colors.
- Typography changes.
- Radius or shadow changes.
- New component patterns.
- New page-layout patterns.
- Screenshot-level visual changes.

## 10.5 Difference review

Reframe should show proposed differences before updating Design DNA.

Examples:

- New accent color detected.
- Card radius changed.
- Previous radius no longer appears.
- New font introduced.
- Existing component now has a new variant.

The user should be able to:

- Accept a difference into Design DNA.
- Reject it as accidental drift.
- Mark it as an intentional exception.
- Apply it only to a specific component or page.
- Keep the current Design DNA unchanged.
- Open the related source files.

## 10.6 What drift detection must not do

It must not:

- Silently rewrite Design DNA.
- Treat every one-off style as a new global rule.
- Assume every changed screenshot represents a design-system change.
- Delete old rules without review.
- Block normal editing solely because drift exists.

---

## 11. Design Mode

## 11.1 Entering Design Mode

After Reframe opens the local website and the user selects Start Designing, the injected browser client places the real localhost page into Design Mode.

A narrow fixed top bar appears.

The page should remain usable for:

- Scrolling.
- Route changes.
- Menu interactions.
- Form testing.
- Responsive resizing.
- Normal page navigation when Select mode is inactive.

## 11.2 Top bar controls

The top bar should include:

- Connection indicator.
- Select.
- Generate.
- History.
- Design DNA.
- Exit.

Optional status indicators may include:

- Current page.
- Current branch or checkpoint.
- Explore Mode status.
- Unsaved visual changes.
- Design-drift warning.

## 11.3 Select mode

Select mode enables element hover and selection.

When disabled, the website should behave normally.

## 11.4 Global Generate

Generate should allow the user to create a new section without first selecting an existing element.

The user should then choose placement relative to a page section, route location, or selected insertion point.

## 11.5 Exit

Exit should remove Reframe overlays and return the page to normal browsing mode.

Exit must not:

- Stop the development server.
- Close VS Code.
- Discard accepted source changes.
- Push changes.
- Delete history.

If temporary Explore Mode changes exist, Reframe should warn the user before exiting and offer to discard, save, or implement them.

---

## 12. Element Selection and Source Mapping

## 12.1 Hover behavior

When the user hovers over an editable element:

- A thin outline appears.
- The probable component or semantic name appears.
- The source is not changed.
- The outline should avoid blocking pointer interaction unnecessarily.
- Reframe should avoid highlighting every insignificant nested element at once.

## 12.2 Selection behavior

When the user clicks an element:

- It becomes selected.
- A persistent outline appears.
- A floating toolbar appears.
- The toolbar follows the element while scrolling.
- Reframe prepares source mapping and context.
- The user can move selection to a parent, child, or sibling when needed.

## 12.3 Source mapping confidence

Reframe should show whether the mapping is:

- Exact.
- Probable.
- Ambiguous.
- Not mapped.

An exact mapping may identify:

- Component name.
- Source file.
- Relevant line or source range.
- Component instance.
- Props.
- Styling source.

An ambiguous mapping should show candidate source locations and ask the user to choose when necessary. Reframe must never apply an automatic source edit when mapping confidence is below the safe threshold.

## 12.4 Component boundaries

Reframe should help users distinguish between:

- A raw DOM element.
- A reusable source component.
- A page-level section.
- A layout wrapper.
- A repeated list item.
- A third-party component.
- A generated runtime element.

## 12.5 Unsupported elements

For elements that cannot be safely edited, Reframe should explain why.

Examples include:

- Browser-native controls with no source mapping.
- Cross-origin embedded content.
- Third-party widgets.
- Canvas-rendered content.
- Runtime-generated content without stable ownership.
- Production pages not paired with a local repository.

---

## 13. Canva-Style Floating Toolbar

## 13.1 Toolbar actions

The selected-element toolbar should include:

- Move.
- Generate.
- Text.
- Color.
- Border.
- Size.
- More.

## 13.2 Toolbar positioning

The toolbar should:

- Stay near the selected element.
- Remain visible during scrolling.
- Reposition when near viewport edges.
- Avoid covering critical controls when possible.
- Collapse or simplify on narrow screens.
- Clearly indicate the selected component.

---

## 14. Three Editing Modes

## 14.1 Direct Edit

Direct Edit handles safe, predictable changes.

Supported examples:

- Text content.
- Basic typography.
- Colors.
- Spacing.
- Width and height.
- Alignment.
- Border radius.
- Border appearance.
- Shadow presets.
- Reordering sibling elements.
- Visibility.
- Duplicating an existing component instance.
- Copying and pasting styles.

Direct Edit should use deterministic source transformations through the Reframe Dev Server when the mapping is reliable.

Direct Edit should not be used for:

- Complex structural rewrites.
- New business logic.
- New data dependencies.
- Cross-component refactors.
- Responsive redesigns requiring architectural decisions.
- Ambiguous source mappings.

## 14.2 Codex Edit

Codex Edit handles structural or intelligent changes.

Supported examples:

- Creating a section.
- Replacing a component.
- Redesigning a selected area.
- Making a layout responsive.
- Connecting functionality.
- Refactoring duplicated components.
- Reusing or extracting a shared component.
- Adjusting related files.
- Updating tests or types when necessary.
- Applying a design reference.
- Performing intent-aware movement.
- Fixing design-critic findings.

Every Codex Edit should include an Element Context Packet or page-level context packet.

## 14.3 Explore Mode

Explore Mode applies experimental changes in the browser without changing source files.

The user should be able to:

- Experiment with layout.
- Try different colors.
- Resize sections.
- Move components.
- Apply temporary design references.
- Test a proposed redesign.
- Compare variations.

The user can then:

- Discard.
- Save as a variation.
- Ask Codex to implement.
- Add an approved rule to Design DNA.

Explore Mode must clearly indicate that changes are temporary.

Temporary changes should not survive unexpectedly after a hard refresh unless the user explicitly saves the variation.

---

## 15. Direct-Edit Features

## 15.1 Move

The user selects Move and drags the element.

During drag:

- Only the browser preview changes.
- A drop indicator shows the proposed position.
- The source remains unchanged.
- Invalid drop zones are visibly rejected.
- The original position remains recoverable.

After drop, Reframe should offer:

- Apply.
- Cancel.
- Ask Codex.

Apply should be available only when Reframe can safely update source structure.

Ask Codex should be recommended when:

- The element crosses component boundaries.
- The target layout uses generated lists.
- Imports or props must change.
- Responsive behavior would be affected.
- The move represents a likely change in design intent.

## 15.2 Text

The Text panel should allow:

- Editing text content.
- Selecting an existing typography role.
- Changing font size.
- Changing weight.
- Changing alignment.
- Changing line height when safe.
- Preserving dynamic bindings where possible.

Reframe must not replace dynamic text with hardcoded content without warning.

If text comes from:

- Props.
- Translation files.
- Content systems.
- Constants.
- Data arrays.

Reframe should identify the source and update the appropriate location or ask the user to choose.

## 15.3 Color

The Color panel should show Design DNA colors first.

It should support:

- Text color.
- Background color.
- Border color.
- Semantic token selection.
- Existing project variables.
- Custom colors.

When a custom color is outside Design DNA, Reframe should offer:

- Use once.
- Add to Design DNA.
- Cancel.

Use once should record an intentional exception rather than silently changing the global design contract.

## 15.4 Border

The Border panel should support:

- Radius.
- Width.
- Style.
- Color.
- Shadow.
- Existing design presets.

Design-system values should be recommended before arbitrary values.

## 15.5 Size

The Size panel should support:

- Width.
- Height.
- Minimum and maximum size when applicable.
- Responsive behavior.
- Existing layout constraints.
- Resize handles.
- Manual values.

Responsive choices should include:

- Keep current behavior.
- Fixed size.
- Ask Codex to optimize.

Reframe should warn when a fixed size is likely to break smaller viewports.

## 15.6 Spacing

Spacing controls should support:

- Margin.
- Padding.
- Gap.
- Section spacing.
- Existing Design DNA spacing tokens.
- Per-side values.
- Responsive values when source mapping supports them.

## 15.7 Duplicate

Duplicate should create another instance using the existing source pattern.

It should preserve:

- Component type.
- Styling.
- Required props.
- List structure.
- Stable identifiers when necessary.

It should not duplicate invalid IDs, analytics identifiers, or data bindings without warning.

## 15.8 Hide

Hide should support:

- Temporary browser-only hiding.
- Source-level conditional removal.
- Responsive visibility.
- Permanent removal only through Delete.

## 15.9 Delete

Delete should show a preview and identify the source consequence.

It should warn when deletion affects:

- Shared components.
- Multiple routes.
- Data arrays.
- Navigation.
- Imports.
- Tests.
- Required accessibility structure.

## 15.10 Copy and paste styles

Style copying should capture a meaningful style set, not only computed CSS.

It should prefer:

- Design tokens.
- Existing utility classes.
- Component variants.
- Project conventions.

Pasting should show conflicts with the target component’s Design DNA or responsive rules.

## 15.11 View source location

This action should open the mapped file in VS Code at the relevant location.

When multiple candidates exist, Reframe should show them rather than choosing silently.

## 15.12 Add rule to Design DNA

The user may convert an observed visual pattern into a documented rule.

Reframe should ask:

- Whether the rule is global.
- Whether it applies to a component type.
- Whether it applies to a page.
- Whether it is an exception.
- Whether existing components should be updated.

## 15.13 View component history

The user should be able to view accepted changes that affected the selected component, including:

- Screenshots.
- Prompts.
- Changed files.
- Checkpoints.
- Design DNA version.
- Restore actions.

---

## 16. Generate Panel

## 16.1 Purpose

The Generate panel is the main interface for Codex-assisted structural changes.

It opens on the side of the website while keeping the selected page visible.

## 16.2 Required information

The panel should show:

- Selected component or page.
- Source location.
- Prompt field.
- Placement options.
- Selected Codex conversation.
- Design DNA behavior.
- Reference attachments.
- Generation action.

## 16.3 Placement options

Supported placement options should include:

- Inside selected element.
- Before selected element.
- After selected element.
- Replace selected element.
- Create at page insertion point.
- Create as a new route when the request requires a page.

## 16.4 Design behavior

The panel should include:

- Preserve current design.
- Allow creative changes.
- Explicit redesign.

Preserve current design should be the default.

Allow creative changes should still use project context but permit controlled variation.

Explicit redesign should warn that the result may introduce new Design DNA proposals.

## 16.5 Generation without selection

When Generate is opened globally, Reframe should gather:

- Current route.
- Page screenshot.
- Page structure.
- Existing sections.
- Available reusable components.
- Design DNA.
- Requested placement.

---

## 17. Codex Conversation Management

## 17.1 First-time conversation selection

The first time generation is used for a project, Reframe should ask where UI work should happen.

Options:

- Start New UI Conversation.
- Choose Existing Conversation.
- Fork Existing Conversation.

## 17.2 Start New UI Conversation

Reframe should create a dedicated project conversation with a recognizable name based on the project.

This should become the default for future UI generation until the user changes it.

## 17.3 Choose Existing Conversation

The conversation picker should:

- Show project-associated conversations first.
- Support search.
- Show recent activity.
- Show whether a conversation is active.
- Allow the user to inspect basic conversation context before selection.
- Avoid showing unrelated conversations by default.

## 17.4 Fork Existing Conversation

Forking should create a separate UI-focused conversation that copies relevant context without continuing unrelated work in the original conversation.

## 17.5 Conversation switching

The user should be able to change the selected conversation at any time from the Generate panel or settings.

Conversation switching should not erase local history.

## 17.6 Conversation identification

Accepted history entries should record the Codex conversation identifier used for the change.

Reframe should not expose private conversation content unnecessarily in visual history.

---

## 18. Element Context Packet

## 18.1 Purpose

The Element Context Packet is the structured bridge between browser selection and repository modification.

It should give Codex enough information to understand:

- What the user selected.
- Where it exists in the repository.
- What it looks like.
- What surrounds it.
- How it behaves responsively.
- Which design rules apply.
- What errors are present.
- What the user wants changed.

## 18.2 Selected-element context

The packet should include:

- Component name.
- Semantic element role.
- Stable element identifier when available.
- Source file.
- Source location.
- Component instance.
- Relevant props.
- Current text.
- Nearby DOM structure.
- Parent and child relationships.
- Repetition or list context.

## 18.3 Visual context

The packet should include:

- Screenshot of the selected element.
- Screenshot of the surrounding section.
- Optional full-page screenshot.
- Computed styles.
- Bounding dimensions.
- Responsive dimensions.
- Current viewport.
- Visibility state.
- Layout relationships.
- Overlap or overflow problems.

## 18.4 Project context

The packet should include:

- Relevant Design DNA rules.
- Relevant tokens.
- Existing reusable components.
- Current route.
- Framework.
- Styling method.
- Browser console errors.
- Build or type errors when available.
- Current repository state.
- Relevant AGENTS.md guidance.

## 18.5 User instruction

The user’s instruction should be appended clearly and separately.

## 18.6 Context minimization

Reframe should include only relevant repository information.

It should not send:

- Entire repositories by default.
- Unrelated environment files.
- Secrets.
- Credentials.
- Private keys.
- Unrelated logs.
- Unrelated conversation history.

## 18.7 Packet preview

Advanced users should be able to inspect a human-readable summary of the packet before sending.

---

## 19. Generation Progress

## 19.1 User-facing progress

Reframe should show understandable stages rather than raw agent logs.

Possible stages include:

- Reading Design DNA.
- Inspecting selected component.
- Finding reusable components.
- Planning the change.
- Updating source files.
- Checking responsive layout.
- Running verification.
- Preparing preview.

## 19.2 Controls

The user should have:

- View Details.
- Stop.

Stopping should attempt to halt the active generation safely.

If files were partially changed, Reframe should restore the pre-generation checkpoint or present a recovery state.

## 19.3 Development-server update

When source changes are applied:

- The localhost page may refresh through the project’s normal development server.
- Reframe should reconnect after refresh.
- The selected result should regain a temporary review outline.
- Reframe should preserve the generation panel state.

---

## 20. Generated-Result Review

## 20.1 Temporary result state

Generated changes should enter a review state before being treated as accepted.

The result should show:

- Generated by Codex.
- Accept.
- Refine.
- Compare.
- Reject.

## 20.2 Accept

Accept should:

- Save the change to local visual history.
- Create a local Git checkpoint.
- Capture a page screenshot.
- Capture a component screenshot.
- Record the user prompt.
- Record the Codex conversation identifier.
- Record changed files.
- Record the Design DNA version.
- Update the design fingerprint.
- Run final source and visual checks.
- Avoid pushing anything remotely.

## 20.3 Refine

Refine should continue in the same selected Codex conversation and preserve the current generated state as context.

The user should be able to describe incremental changes without rebuilding the request from the beginning.

## 20.4 Compare

Compare should show the previous design against the current generated result without requiring the user to manually switch Git commits.

## 20.5 Reject

Reject should restore the project to the pre-generation state.

Rejection should remove partial generated changes from the working tree when they belong only to that generation.

## 20.6 Verification

Before acceptance, Reframe should check where possible:

- Build status.
- Type errors.
- Console errors.
- Missing imports.
- Broken routes.
- Responsive overflow.
- Severe visual overlap.
- Design DNA conflicts.
- Accessibility regressions.
- Unexpected file scope.

Warnings should not always block acceptance, but they must be visible.

---

## 21. Intent-Aware Editing

## 21.1 Purpose

Intent-Aware Editing makes Reframe understand the likely goal behind a visual action rather than applying a literal DOM change.

## 21.2 Example behavior

When a button is moved from a hero section to a navbar, Reframe should consider whether it needs to:

- Reuse the project’s navigation button variant.
- Update imports.
- Preserve routing.
- Move or recreate the correct component instance.
- Remove obsolete source code.
- Maintain responsive behavior.
- Preserve spacing conventions.
- Avoid duplicating IDs.
- Keep the architecture clean.

When a card is resized inside a grid, Reframe should consider whether the correct action is:

- Changing the card width.
- Changing the grid column definition.
- Updating a responsive breakpoint.
- Changing a shared component variant.
- Applying a page-specific exception.

## 21.3 User control

Reframe should show its interpretation before applying a complex intent-aware change.

The user should be able to:

- Accept the interpretation.
- Choose a literal direct edit.
- Send the action to Codex.
- Cancel.

## 21.4 What it must not do

Intent-Aware Editing must not:

- Pretend certainty when multiple interpretations are possible.
- Refactor unrelated files.
- Change business logic without clear need.
- Convert every simple visual action into a large architectural edit.
- Modify shared components globally when only one instance was intended.

---

## 22. Prompting a Selected Component

The user should be able to select any mapped component and ask for a focused change.

Examples include:

- Make this card emphasize the annual plan.
- Make this section more compact.
- Add a product dashboard preview inside this hero.
- Turn this into a reusable component.
- Improve this section on mobile.
- Replace this pricing layout with a comparison table.

Reframe should scope the change to the selected component and related files unless broader changes are necessary and disclosed.

---

## 23. Natural-Language Refactoring

## 23.1 Purpose

Reframe should support repository-aware refactoring requests initiated from the browser.

Examples:

- Turn every repeated card into a reusable component.
- Replace duplicated button styles with the existing Button component.
- Move this page section into its own component.
- Make all form fields use the compact form variant.
- Standardize card spacing across this route.

## 23.2 Refactor review

Before applying a broad refactor, Reframe should show:

- Estimated scope.
- Components affected.
- Pages affected.
- Files likely to change.
- Relevant Design DNA rule.
- Whether the change is local or global.

## 23.3 What it must not do

Natural-language refactoring must not:

- Change unrelated business logic.
- Rename public interfaces without warning.
- Apply a global visual change when the user selected only one component.
- Ignore tests, types, or imports affected by the refactor.

---

## 24. AI Inspector

## 24.1 Purpose

The AI Inspector provides an understandable relationship between a visual element and its code.

## 24.2 Inspector information

For a selected element, it should show:

- Component name.
- Source file.
- Source location.
- Framework component type.
- Props.
- Children.
- Styling source.
- Applied tokens.
- Utility classes.
- Component variant.
- Parent component.
- Route.
- Responsive behavior.
- Reuse locations.
- Related Design DNA rules.

## 24.3 Explain action

The user should be able to ask questions such as:

- Why is this margin 24 pixels?
- Where does this color come from?
- Is this component reused anywhere else?
- Why does this stack on mobile?
- Which Design DNA rule applies here?

The explanation should cite source and Design DNA evidence when available.

## 24.4 What it must not do

The inspector should not:

- Fabricate a source location.
- Claim a style comes from Design DNA when it is a one-off value.
- Hide cascading or inherited styles.
- Treat computed styles as direct source declarations without clarification.

---

## 25. Design Critic

## 25.1 Purpose

The Design Critic reviews the current page or selected section for design and usability issues.

## 25.2 Review categories

The critic may review:

- Accessibility.
- Contrast.
- Visual hierarchy.
- Spacing consistency.
- Typography consistency.
- Component consistency.
- Responsive behavior.
- Overflow.
- Alignment.
- Interaction clarity.
- Form usability.
- Mobile density.
- Page-width consistency.
- Design DNA compliance.
- Performance-related interface concerns.

## 25.3 Findings

Each finding should include:

- Issue.
- Severity.
- Affected element.
- Visual evidence.
- Relevant Design DNA rule.
- Suggested action.
- Whether it can be fixed directly or requires Codex.

## 25.4 Fix actions

The user may:

- Fix one.
- Fix selected findings.
- Ask Codex to fix all safe findings.
- Ignore.
- Mark as intentional.
- Add an exception to Design DNA.

## 25.5 What it must not do

The critic should not:

- Treat subjective preference as a critical error.
- Change the interface automatically without approval.
- Recommend a new style system when the current one is valid.
- Prioritize visual novelty over project consistency.
- Produce vague advice without identifying affected elements.

---

## 26. Reference Adaptation

## 26.1 Supported references

Users may provide:

- Screenshot.
- Figma export.
- Hand-drawn mockup.
- Another site screenshot.
- Markdown design specification.
- Approved project reference saved in Design DNA.

## 26.2 Controlled borrowing

Reframe should ask which characteristics to borrow:

- Page structure.
- Component arrangement.
- Colors.
- Typography.
- Interaction behavior.
- Content density.
- Navigation pattern.
- Responsive behavior.

## 26.3 Brand treatment

The user should choose:

- Preserve this project’s Design DNA.
- Blend both designs.
- Follow the reference closely.

Preserve Design DNA should be the default.

## 26.4 Adaptation behavior

A request may be:

Use the reference’s dashboard layout while keeping the project’s colors, typography, cards, buttons, and spacing.

Reframe should translate the reference into the project’s existing component and token language whenever possible.

## 26.5 Reference review

Before generation, Reframe should summarize:

- What will be borrowed.
- What will be preserved.
- Which existing components may be reused.
- Which new components may be required.
- Whether new Design DNA proposals may be created.

## 26.6 What it must not do

Reference adaptation must not:

- Clone everything automatically.
- Copy branding, logos, text, or proprietary assets without user direction.
- Replace the project’s design system when preservation is selected.
- Assume colors and typography should be copied.
- Generate isolated HTML outside the project architecture.
- Ignore responsive behavior.

---

## 27. Multiple Design Variations

## 27.1 Purpose

Reframe may generate multiple variations of a selected component or page using the same Codex workflow.

Possible variation directions include:

- Minimal.
- Dense.
- Editorial.
- Dashboard-focused.
- Startup.
- Enterprise.
- Existing-brand conservative.
- Creative within Design DNA.

## 27.2 Variation presentation

Variations should be shown as temporary previews or visual branches.

The user should be able to:

- Preview.
- Compare.
- Select one.
- Refine one.
- Save multiple as branches.
- Reject all.

## 27.3 Constraint

All variations should preserve Design DNA unless the user allows creative changes or explicitly requests a redesign.

---

## 28. Visual Branching

## 28.1 Purpose

The user should be able to branch from an earlier design rather than relying only on linear undo.

## 28.2 Branch behavior

From any accepted checkpoint, the user may create a visual branch such as:

- Original.
- Minimal direction.
- Enterprise direction.
- Compact mobile direction.
- Marketing redesign.

Each branch should maintain:

- Parent checkpoint.
- Screenshots.
- Prompt.
- Changed files.
- Design DNA version.
- Codex conversation relationship.
- Local Git checkpoint.

## 28.3 Branch comparison

The user should be able to compare:

- Branch against parent.
- Branch against current.
- Two branches.
- Component-level screenshots.
- Full-page screenshots.
- Changed-file lists.

## 28.4 Merge behavior

Reframe may help the user apply a chosen branch as the current working design.

It should not perform an automatic complex Git merge without showing conflicts and changed files.

---

## 29. Visual Time Machine

## 29.1 Purpose

The Visual Time Machine is the most memorable history interaction in Reframe.

It allows the user to experience earlier designs visually before restoring source code.

## 29.2 Captured data

After every accepted change, Reframe should save:

- Local Git checkpoint.
- Full-page screenshot.
- Component screenshot.
- User prompt.
- Codex conversation identifier.
- Changed files.
- Design DNA version.
- Route.
- Viewport.
- Timestamp.
- Verification results.

## 29.3 Floating history control

A floating control should support:

- Hover or hold to show the previous design.
- Release to return to the current design.
- Scroll to move through earlier versions.
- Click to open visual history.
- Restore to return to a selected checkpoint.

## 29.4 Screenshot-first comparison

For the first implementation, previous-versus-current preview should use screenshots rather than continuously switching the live repository between commits.

This avoids:

- Repeated development-server rebuilds.
- Unstable working-tree changes.
- Temporary source conflicts.
- Slow comparisons.

## 29.5 Full comparison view

The full comparison view should support:

- Previous and current labels.
- Draggable visual divider.
- Route and viewport information.
- Restore Previous.
- Keep Current.
- Open History.
- Changed-file summary.
- Prompt summary.

## 29.6 Restore

Restore should:

- Explain which checkpoint will become current.
- Warn about uncommitted work.
- Create a safety checkpoint before restoration.
- Restore the selected local state.
- Refresh localhost.
- Restore the associated Design DNA version when requested.
- Avoid pushing remotely.

---

## 30. Visual Diff

## 30.1 Purpose

Visual Diff translates repository changes into visual evidence.

## 30.2 Visual change record

Each accepted checkpoint should show:

- Before screenshot.
- After screenshot.
- Component comparison.
- User prompt.
- Files changed.
- Source summary.
- Design DNA changes.
- Verification status.

## 30.3 Relationship to Git

Reframe should use local Git checkpoints when possible, but it should not replace normal Git commands, commits, branches, or remote workflows.

The user should be able to open the actual diff in VS Code.

## 30.4 What it must not do

Visual Diff must not:

- Push changes.
- Rewrite Git history silently.
- Delete user commits.
- Hide source conflicts.
- Treat screenshots as a substitute for the actual source diff.

---

## 31. Async Collaboration

## 31.1 Purpose

Async Collaboration allows designers, developers, and teammates to leave visual comments, highlight interface regions, and review proposed changes directly on the running local application.

Instead of relying on a hosted collaboration platform, Reframe stores collaboration data locally inside the project and synchronizes it naturally through Git.

The goal is to provide Figma-style commenting that stays attached to the real application and real source code instead of an outdated mockup.

## 31.2 Local collaboration storage

Reframe should store collaboration data inside the existing project metadata.

Example:

.reframe/
├── design-dna/
├── history/
├── annotations/
│   ├── <annotation-id>.json
│   ├── <annotation-id>.json
│   └── <annotation-id>.json

Each annotation is stored as its own JSON file to minimize Git merge conflicts.

Each annotation should include:

- Annotation ID
- Author
- Timestamp
- Component name
- Stable element identifier
- Source file
- Current route
- Viewport
- Comment
- Highlight metadata
- Status
- Related checkpoint
- Related Design DNA version

## 31.3 Anchoring

Comments and highlights should be anchored to:

- Component name
- Stable element selector or fingerprint
- Source file
- Source mapping

They must not rely only on screen coordinates.

## 31.4 Commenting workflow

A reviewer should be able to:

- Leave a comment on a selected component.
- Highlight a region.
- Draw an attention box or arrow.
- Attach a screenshot.
- Suggest a Design DNA rule.
- Reply to an existing discussion.
- Resolve or reopen a discussion.

Creating an annotation should only modify the local annotation files and should never modify application source code.

## 31.5 Git-first synchronization

Reframe should not require:

- A backend server.
- User accounts.
- Real-time synchronization infrastructure.

The synchronization workflow should be:

1. A user creates a comment or highlight.
2. Reframe creates or updates a single annotation file inside `.reframe/annotations/<annotation-id>.json`.
3. The change is committed with the repository.
4. The repository is pushed normally through Git.
5. Another teammate pulls the repository.
6. Reframe automatically loads the annotation files and renders the comments and highlights.

Git is the synchronization mechanism.

## 31.6 Loading collaboration data

When Reframe starts it should:

- Read annotation metadata.
- Restore pins and highlights.
- Match annotations to current components.
- Warn when mappings are no longer valid.
- Hide unresolved annotations until reviewed.

## 31.7 Relationship with Visual Time Machine

Annotations should remember the checkpoint where they were created.

When viewing an older checkpoint, Reframe should display annotations that existed at that point in history.

## 31.8 Relationship with Design DNA

A reviewer should be able to promote a comment into a permanent Design DNA rule.

Example:

"This button should always use the primary color."

↓

Add to Design DNA

↓

Rule created.

## 31.9 Business value

For developers, Async Collaboration provides Figma-style comments anchored to the real running application and real source components, preventing feedback from becoming disconnected from the implementation.

For teams, it creates a lightweight review workflow without introducing servers or collaboration infrastructure.

For commercial editions, Async Collaboration naturally supports future team-focused features such as shared review workflows, approval queues, organization policies, and hosted collaboration without changing the local-first architecture.

## 31.10 What it must not do

Async Collaboration must not:

- Require a hosted collaboration backend.
- Require user accounts.
- Depend on real-time synchronization.
- Store annotations only by screen coordinates.
- Modify application source files when only comments are created.
- Lose annotations after normal Git operations.

---

## 32. Source Change Safety

## 32.1 Pre-change checkpoint

Before a Codex Edit or a potentially destructive Direct Edit, Reframe should create a recoverable local checkpoint.

## 32.2 File-scope awareness

Reframe should show the files it expects to modify.

If the actual changed-file scope becomes significantly larger, it should warn the user.

## 32.3 Uncommitted work

If the repository already has uncommitted changes, Reframe should:

- Detect them.
- Avoid overwriting them.
- Explain overlap.
- Create a safe checkpoint when possible.
- Ask the user to review conflicts if the same source region is affected.

## 32.4 Shared-component warnings

When editing a shared component, Reframe should show all known reuse locations and whether the change affects them.

The user should be able to choose:

- Update shared component.
- Create a local variant.
- Apply only to this instance.
- Cancel.

## 32.5 Development-server failures

If the development server fails after a change, Reframe should:

- Show the error.
- Preserve the pre-change checkpoint.
- Offer rollback.
- Offer Codex Fix.
- Avoid accepting the result as successful.

---

## 33. Responsive Editing

## 33.1 Viewports

Reframe should support testing at common and custom viewports.

## 33.2 Responsive context

Selected elements should show:

- Current dimensions.
- Parent constraints.
- Breakpoint behavior.
- Hidden or visible states.
- Wrapping.
- Stack behavior.
- Overflow.

## 33.3 Responsive edits

A user may:

- Keep current behavior.
- Apply only to current breakpoint.
- Apply across all breakpoints.
- Ask Codex to optimize.

## 33.4 Cross-viewport verification

After structural generation, Reframe should check at least representative mobile, tablet, and desktop widths when possible.

## 33.5 What it must not do

Reframe must not:

- Apply desktop fixed sizes to mobile without warning.
- Assume one viewport represents the full design.
- Hide overflow issues discovered at other widths.
- Rewrite all breakpoints for a small local change unless approved.

---

## 34. Accessibility and Quality Checks

Reframe should check where possible:

- Color contrast.
- Missing accessible names.
- Broken heading hierarchy.
- Click targets.
- Keyboard focus visibility.
- Form label relationships.
- Image alternative text.
- Responsive readability.
- Motion-related concerns if existing motion is modified.
- Semantic element replacement.

These checks should be presented as warnings or findings and should not automatically rewrite the project.

---

## 35. Beginner Experience and Distribution

### 35.1 Primary promise

**Open a project folder, run one command, and start editing the real website visually in your browser.**

For non-technical users:

**Open Reframe, choose a project folder, and click Start.**

### 35.2 Commands

The primary command is `npx reframe`. Optional advanced commands may exist, but they must not be required for normal onboarding.

### 35.3 No mandatory global installation

Reframe should not require a global npm installation or a user account for local editing.

### 35.4 Package-manager support

Reframe should detect and respect npm, pnpm, Yarn, and Bun without changing the project’s chosen package manager.

### 35.5 Business and adoption advantages

The one-command architecture supports low-friction trials, avoids extension permission concerns and browser-store review, works in locked-down company browsers, supports local-first privacy, and enables open-source adoption.

Optional paid services may include shared Design DNA, team visual history, collaboration permissions, hosted reference libraries, organization drift dashboards, policy enforcement, and team analytics. The core local workflow should remain useful without a paid account.

---

## 36. Settings

Settings should include:

- Project root.
- Development-server command and local address.
- Browser-client connection.
- Default Codex conversation.
- Default Design DNA behavior.
- History storage location.
- Screenshot retention.
- Git checkpoint behavior.
- AGENTS.md integration.
- Privacy controls.
- Reference storage.
- Collaboration permissions.
- Experimental feature controls.
- Framework-specific behavior.

---

## 37. Privacy and Local Data

## 37.1 Local-first expectation

Project analysis, screenshots, history metadata, and checkpoints should remain local unless the user explicitly sends context to Codex or enables collaboration.

## 37.2 Sensitive-file protection

Reframe should avoid reading or sending:

- Environment secrets.
- Private keys.
- Credentials.
- Token files.
- Database dumps.
- Unrelated personal files.
- Ignored sensitive directories.

## 37.3 Context disclosure

Before sending a Codex request, Reframe should be able to summarize which categories of context will be included.

## 37.4 Screenshot privacy

Screenshots may contain user or test data.

Reframe should support:

- Excluding specific regions.
- Blurring selected regions.
- Disabling full-page screenshots.
- Using component-only screenshots.
- Retention settings.



## 37.5 Local execution trust

Because Reframe writes to local source files, production releases should:

- Use versioned releases.
- Avoid postinstall scripts.
- Support version pinning.
- Publish reproducible builds.
- Clearly disclose filesystem permissions.

---

## 38. Performance Requirements

Reframe should:

- Keep hover and selection responsive.
- Avoid injecting large overlays that noticeably slow the page.
- Debounce expensive analysis.
- Capture screenshots only when needed.
- Avoid rebuilding Design DNA on every file save.
- Cache source mappings.
- Recover source mapping after normal hot reloads.
- Keep the top bar and toolbar lightweight.
- Avoid sending large context packets when smaller ones are sufficient.

---

## 39. Error States

Reframe should provide clear handling for:

- Reframe Dev Server stopped.
- Development server stopped.
- Wrong project root detected.
- Source mapping failed.
- Codex unavailable.
- Codex conversation unavailable.
- Generation stopped.
- Partial file changes.
- Build failed.
- Type check failed.
- Browser console errors.
- Git checkpoint failed.
- Screenshot capture failed.
- Design DNA conflict.
- Drift-analysis failure.
- Unsupported framework behavior.
- Cross-origin content.
- Collaboration conflict.

Every error should explain:

- What happened.
- Whether source files changed.
- Whether a recovery checkpoint exists.
- What the user can do next.

---

## 40. Framework Support Strategy

### 40.1 Initial Supported Frameworks

The first public version of Reframe officially supports only:

- React (JavaScript / JSX)
- React + Tailwind CSS
- React + CSS Modules
- React + plain CSS
- Vanilla HTML + Vanilla CSS + Vanilla JavaScript

### 40.2 Tailwind CSS Support

Reframe should understand Tailwind utility classes, Tailwind configuration, reusable utility patterns, responsive variants, and project design tokens extracted from Tailwind.

When editing Tailwind projects, Reframe should preserve existing utility classes whenever possible instead of replacing them with inline styles.

### 40.3 React Support

Reframe should understand React component boundaries, JSX, props, reusable components, layouts, and common React project structures.

### 40.4 Vanilla HTML/CSS Support

For non-framework projects, Reframe should map HTML elements back to HTML, CSS, and JavaScript files and preserve the existing project structure.

### 40.5 TypeScript

TypeScript source editing is **not supported in the initial release**.

Reframe may detect TypeScript projects, but it should display that TypeScript editing is experimental and unsupported rather than attempting unreliable edits.

### 40.6 Unsupported Frameworks

Frameworks such as Vue, Angular, Svelte, Solid, Astro, Nuxt, Qwik, and other ecosystems are planned for future versions.

For unsupported projects, Reframe should gracefully fall back to browser inspection, Explore Mode, screenshot comparison, and manual source-location assistance.

---

## 41. Demonstration Flow

A strong Reframe demonstration should show:

1. Open a supported React or Vanilla JavaScript project folder.
2. Run `npx reframe`.
3. Show automatic framework and package-manager detection.
4. Show the development server and Reframe starting together.
5. Show the browser opening automatically with no extension installed.
6. Show Design DNA status and enter Design Mode.
7. Select a real source component and reveal its source location.
8. Perform a Direct Edit and show the JSX, HTML, CSS, or JavaScript file updating.
9. Use Explore Mode without changing source.
10. Ask Codex to implement the experiment using an Element Context Packet.
11. Review and accept the result.
12. Show Visual Time Machine, Design DNA drift review, reference adaptation, and restore.
13. End by showing that the complete experience required only the project, one command, and a normal browser.


---

## 42. Functional Acceptance Criteria

Reframe is considered functionally successful when:

- `npx reframe` can detect the project, start the required local processes, inject the browser client, and open the correct local website.
- The user can enter Design Mode without installing browser or editor extensions.
- The user can select an element and see a likely source mapping.
- The floating toolbar remains usable while scrolling.
- A safe Direct Edit can update the correct source location.
- Explore Mode can preview changes without changing source files.
- A selected element can produce an Element Context Packet.
- A structural request can be sent to a selected Codex conversation.
- Generation progress is understandable.
- The generated result can be accepted, refined, compared, or rejected.
- Accepting creates a local checkpoint and screenshots.
- Rejecting restores the pre-generation state.
- Design DNA is created, reviewable, and referenced by AGENTS.md.
- Design drift is detected and reviewed before Design DNA changes.
- Reference adaptation can preserve project branding while borrowing selected characteristics.
- Visual Time Machine can preview a previous screenshot.
- A selected checkpoint can be restored safely.
- Reframe does not push changes automatically.
- Reframe does not silently overwrite uncommitted work.
- A non-technical evaluator can start the demo through one command or the folder-based launcher.
- Unsupported mappings are clearly labeled.

---

## 43. Product Boundaries and Prohibited Behavior

Reframe must not:

- Push to remote Git without an explicit separate user action.
- Change production websites or attach to arbitrary sites that were not started or configured through Reframe.
- Apply structural source edits without a recoverable checkpoint.
- Send secrets or unrelated repository data to Codex.
- Represent temporary browser edits as saved source changes.
- Treat every rendered element as independently editable.
- Replace existing AGENTS.md content.
- Rewrite Design DNA without review.
- Add new global design tokens from one accidental style.
- Clone reference designs without controlled borrowing options.
- Hide changed files.
- Hide build or console failures.
- Modify shared components globally without showing impact.
- Continue using the wrong project root after a project-detection mismatch is found.
- Invent source mappings.
- Automatically commit, merge, or resolve Git conflicts without disclosure.
- Include Multi-AI Comparison.
- Include an AI Animation Generator.
- Require a browser extension, VS Code extension, native messaging host, account signup, or proprietary IDE for the primary local workflow.

---

## 44. Final Product Positioning

Reframe should be presented as:

**A one-command, AI-native visual development environment that injects directly into a local project and connects the running browser interface, the real source repository, the project’s Design DNA, Codex, and visual version history—without requiring a browser extension, VS Code extension, or proprietary IDE.**

Its value is not merely that users can detect colors, drag elements, or generate sections.

Its value is that Reframe creates a trustworthy translation layer between visual intent and maintainable source code.

The product should make a developer feel that:

- The browser understands the codebase.
- Codex understands the selected interface.
- Generated changes understand the project’s design.
- Every visual decision can be reviewed.
- Every accepted result can be restored.
- The project’s design knowledge survives future conversations and contributors.