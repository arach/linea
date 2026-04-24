# Linea Helper Mac Roadmap

## Intent

Turn Linea into a native Apple product with one clear systems story:

1. the user reads and imports on iPhone, iPad, or Mac,
2. a trusted Mac can act as a helper device for heavy local workloads,
3. the main offload workload is free audiobook generation using open-source TTS,
4. local network paths are preferred when available,
5. Cloudflare is used as a control plane and remote fallback, not as the main
   media transport.

This roadmap is meant to keep the product focused on reading and listening.
We do **not** want to drift into generic remote desktop, generic file sync, or
general-purpose device orchestration.

## Product Thesis

Linea should let a user turn books, papers, scans, and notes into a calm reading
and listening experience without locking the core experience behind a
subscription TTS bill.

The most important enabling idea is a `Helper Mac`:

- the Mac runs local OCR and open-source TTS,
- the phone or tablet can request those jobs,
- the user gets the benefit of desktop compute without having to understand a
  network stack.

The product should feel like:

- "Use my Mac to make this listenable"

not:

- "Pair devices"
- "Configure a relay"
- "Run a personal server"

## Design Principles

### 1. Native first

- iPhone and iPad app: native SwiftUI
- macOS app: native SwiftUI with AppKit bridges only where needed
- shared document and services logic in Swift packages

### 2. Local first

If the iPhone and Mac are on the same network, Linea should prefer a direct
local path for discovery, control, and heavy file movement.

### 3. Cloud as control plane

Cloudflare should coordinate presence, job dispatch, and remote fallback.
It should not become the default transport for chapter audio or large document
payloads.

### 4. Narrow capability surface

The helper device should expose only a small set of Linea-specific abilities:

- audiobook generation
- OCR
- artifact fetch
- small library lookup or metadata sync

No arbitrary filesystem browsing.
No generic remote command execution.

### 5. Delight before breadth

The first version should make one flow feel magical:

- choose a document on iPhone
- ask the Mac to generate audio
- watch progress
- play the finished result

## Current Repo Context

The repo already contains:

- a native iOS scaffold under `apps/ios/Linea`
- local document services such as `DocumentLibrary`, `PDFImportService`,
  `OCRService`, `SpeechService`, and `DocumentChunker`
- a web/server prototype with local OCR plumbing under `server/linea/services`

That gives us enough shape to start the native architecture without a rewrite
from scratch.

## Target Architecture

### Shared packages

Recommended package shape:

- `Packages/LineaCore`
- `Packages/LineaServices`
- `Packages/LineaDevices`
- `Packages/LineaUI`

Responsibilities:

- `LineaCore`
  - document models
  - sectioning
  - playback state
  - job types
  - capability enums
- `LineaServices`
  - document library
  - import
  - OCR orchestration
  - audiobook orchestration
  - artifact management
- `LineaDevices`
  - helper device trust
  - local discovery
  - transport selection
  - cloud presence
- `LineaUI`
  - shared reader and listening primitives where reuse makes sense

### App roles

- `apps/ios/Linea`
  - reading
  - import
  - submit jobs to helper device
  - consume artifacts
- `apps/macos/LineaMac`
  - document library
  - helper Mac runtime
  - local OCR/TTS execution
  - device approval and settings

### Network roles

- local LAN path
  - Bonjour / Network.framework discovery
  - direct local HTTP/WebSocket for control and large artifact transfer
- cloud fallback path
  - Cloudflare Worker
  - Durable Object for user or helper room coordination
  - R2 for temporary remote artifact handoff

## Major Workstreams

### 1. Shared Apple Core

Goal:

- extract current iOS logic into reusable packages

Primary source material:

- `ReadableDocument`
- `DocumentLibrary`
- `DocumentChunker`
- `PDFImportService`
- `OCRService`
- `SpeechService`

Deliverables:

- package boundaries established
- iOS app building against package APIs instead of app-local copies
- no major user-facing behavior change yet

### 2. Native macOS App

Goal:

- create a proper macOS target, not a web shell

Deliverables:

- library browser
- reader shell
- helper settings
- background job runtime
- local artifact store for generated audio

### 3. Audiobook Pipeline

Goal:

- make free local audiobook generation the flagship helper workflow

Deliverables:

- one initial open-source TTS backend
- chapterized generation pipeline
- queue / progress model
- cached outputs by document and voice profile
- playback-ready artifact format

Suggested initial optimization targets:

- fast enough to feel useful on Apple Silicon
- stable enough to resume partial work
- simple enough that support does not become a model zoo problem

### 4. Local Network Fast Path

Goal:

- make same-Wi-Fi behavior feel instant and cheap

Deliverables:

- helper Mac advertises itself on LAN
- iPhone/iPad discovers nearby helper Macs
- direct local control channel
- direct local file transfer for large inputs and audio outputs

Success looks like:

- no cloud dependency when both devices are nearby
- very low latency for progress and artifact availability

### 5. Cloudflare Fallback

Goal:

- support remote job submission without making Linea a transport-heavy service

Deliverables:

- Worker auth/session entrypoint
- Durable Object presence + job coordination
- R2 temporary artifact handoff
- remote async artifact pickup

Important guardrail:

- remote mode is initially async-first, not continuous low-latency streaming

### 6. Device Experience

Goal:

- keep the product language consumer-friendly

Deliverables:

- `Devices` or `Helper Macs` settings screen
- explicit "Use this Mac for audiobook generation"
- approve / revoke helper access
- clear state: local, remote, unavailable, generating

Avoid:

- surfacing too much pairing jargon
- exposing network topology in the main product flow

### 7. Cost and Retention Controls

Goal:

- keep infrastructure costs predictable

Deliverables:

- local transfer whenever possible
- temporary R2 retention rules
- chapter artifact cleanup policy
- basic job and storage telemetry

## Milestones

### M0: Planning contract

Ship:

- roadmap doc
- `Helper Mac v1` spec
- package extraction plan
- TTS backend decision

### M1: Native helper alpha on same Wi-Fi

Ship:

- shared packages started
- macOS app target
- local helper runtime
- one audiobook generation flow from iPhone to Mac over LAN

Success criteria:

- user can pick a document on iPhone and generate audio on a nearby Mac
- progress is visible
- finished audio is playable on iPhone

### M2: Local OCR + broader helper workload

Ship:

- helper-based OCR for large or image-heavy documents
- better artifact caching
- retry and resume behavior

### M3: Cloud fallback beta

Ship:

- Cloudflare presence and job dispatch
- remote async generation
- temporary artifact pickup via R2

Success criteria:

- user can request a job while away from the Mac
- Mac completes when online
- user can retrieve completed audio later without manual file wrangling

### M4: Product polish

Ship:

- queue UX
- job history
- smarter cleanup
- better voices and quality controls
- resilient device state and error copy

## Suggested Near-Term Sequence

### Step 1

Extract `ReadableDocument` and core services into a shared package.

### Step 2

Add a minimal native macOS Linea target that can open the local library.

### Step 3

Implement a helper runtime that can accept one job type:

- `audio.generate`

### Step 4

Add Bonjour-based discovery and direct local transport.

### Step 5

Add a simple iPhone UI:

- select helper Mac
- submit audiobook job
- show progress

### Step 6

Only after local delight exists, add Cloudflare fallback.

## Risks

### TTS backend complexity

Open-source TTS can sprawl quickly across models, voices, and hardware paths.
We should choose one good-enough backend first and delay backend multiplication.

### Artifact growth

Audiobook files are large enough that retention policy matters early.
The system should treat remote artifacts as temporary unless the user explicitly
keeps them.

### Network path ambiguity

If we blur local and remote behavior too early, debugging and support get messy.
We should keep transport selection explicit in code and legible in internal
instrumentation.

### Product drift

The helper device idea can sprawl into sync, desktop control, or agent tasks.
That would dilute the reading/listening product. We should keep the helper
surface intentionally small.

## Recommendation

Build this in the following order:

1. shared Apple core
2. native Mac helper
3. same-Wi-Fi audiobook generation
4. local OCR offload
5. Cloudflare fallback

That sequence keeps the magic close to the user, proves the core product loop
early, and avoids paying complexity tax before we know the listening workflow is
strong.
