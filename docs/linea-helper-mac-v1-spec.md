# Linea Helper Mac V1 Spec

## Purpose

Define the first concrete version of the `Helper Mac` system for Linea.

The first version exists to make one thing work extremely well:

- a user requests audiobook generation from iPhone or iPad,
- a trusted Mac performs the work locally using open-source TTS,
- the user receives progress and the finished artifact,
- the system prefers local transport when devices are nearby.

OCR is included as a secondary workload, but audiobook generation is the main
reason this system exists.

## Product Framing

`Helper Mac` is the user-facing term.

Internally, this is a trusted device link with a small capability surface.

The experience should feel like:

- "Use this Mac to generate audio and run OCR for Linea"

It should not feel like:

- remote shell access
- generic device sync
- a fleet or agent network

## Non-Goals

V1 does **not** include:

- arbitrary filesystem browsing
- generic remote command execution
- full media relay through Cloudflare
- live low-latency remote streaming as the primary path
- multi-user shared helper machines
- broad cross-document background sync

## Roles

### Requester device

An iPhone, iPad, or Mac initiating a Linea workload.

Primary responsibilities:

- submit a supported job
- observe progress
- fetch completed artifacts

### Helper Mac

A trusted macOS device that can execute local workloads on behalf of the
requester.

Primary responsibilities:

- advertise availability
- approve or revoke trust
- execute allowed workloads
- manage local artifacts

### Cloud relay

Cloudflare infrastructure used only when devices are not on the same local
network, or when cloud presence is required.

Primary responsibilities:

- presence
- job coordination
- remote fallback
- temporary artifact handoff

## Capabilities

The Helper Mac exposes only these capabilities in V1:

- `audio.generate`
- `ocr.document`
- `artifact.fetch`
- `library.lookup`

### `audio.generate`

Primary capability for V1.

Input:

- document identifier or imported source reference
- selected range or chapter set
- voice profile identifier
- output format preference

Output:

- chapter or section audio artifacts
- progress events
- final manifest

### `ocr.document`

Secondary capability.

Input:

- imported PDF or page image references
- optional page range

Output:

- normalized page text
- OCR confidence metadata

### `artifact.fetch`

Allows the requester to retrieve generated artifacts from the helper.

### `library.lookup`

Restricted metadata lookup for the user’s Linea library.

This is not arbitrary file system access.

## Trust Model

V1 security should be pragmatic, not elaborate.

Requirements:

- helper access must be explicitly approved on the Mac
- the helper exposes only Linea-specific capabilities
- local network transport is scoped to the Linea service
- helper access can be revoked at any time

Recommended defaults:

- one signed-in Linea account across devices
- one-user helper relationship
- local helper disabled until explicitly turned on

We do **not** need Scout-grade security for V1, but we do need a narrow and
legible trust boundary.

## Transport Model

Transport selection is the most important systems rule in V1.

### Rule 1: local first

If requester and helper are on the same local network, Linea should use a
direct local transport.

Recommended local stack:

- discovery: Bonjour / Network.framework
- control channel: local WebSocket or lightweight RPC over HTTPS
- large artifact transfer: local HTTP

### Rule 2: cloud fallback second

If requester and helper are not on the same network, Linea may use Cloudflare
as a control plane and artifact handoff layer.

Recommended cloud stack:

- Worker for session entry
- Durable Object for presence and job coordination
- R2 for temporary remote artifact upload/download

### Rule 3: do not relay large audio through the control plane

Durable Objects should carry only control messages:

- job submit
- accepted
- progress
- completed
- failed

Large artifacts should move either:

- directly over LAN, or
- through temporary object storage

## Discovery

### Local discovery

The Helper Mac advertises a Linea service on the LAN.

The requester device browses for nearby helper services.

Discovery payload should include only lightweight metadata:

- helper identifier
- display name
- capability flags
- version

### Cloud presence

Cloud presence should be a fallback path for:

- "my helper Mac is online"
- "my helper Mac is unavailable"
- "job is running remotely"

Cloud presence is not responsible for shipping the full media payload by
default.

## Job Types

### `audio.generate`

### Inputs

```json
{
  "type": "audio.generate",
  "jobId": "job_123",
  "documentId": "doc_123",
  "range": {
    "kind": "chapters",
    "chapterIds": ["ch_1", "ch_2"]
  },
  "voice": {
    "id": "voice.default",
    "speed": 1.0
  },
  "output": {
    "format": "m4a"
  }
}
```

### Progress events

```json
{
  "jobId": "job_123",
  "type": "job.progress",
  "phase": "rendering",
  "completedUnits": 2,
  "totalUnits": 10,
  "message": "Rendering chapter 3 of 10"
}
```

### Completion payload

```json
{
  "jobId": "job_123",
  "type": "job.completed",
  "result": {
    "manifestId": "manifest_123",
    "artifactCount": 10,
    "delivery": {
      "mode": "local-http",
      "baseURL": "https://helper-mac.local"
    }
  }
}
```

### `ocr.document`

### Inputs

```json
{
  "type": "ocr.document",
  "jobId": "job_456",
  "documentId": "doc_456",
  "pageRange": {
    "start": 1,
    "end": 20
  }
}
```

### Completion payload

```json
{
  "jobId": "job_456",
  "type": "job.completed",
  "result": {
    "pageCount": 20,
    "averageConfidence": 0.91
  }
}
```

## Artifact Delivery

### Local mode

When both devices are on the same LAN:

- requester submits control messages directly to helper
- helper serves artifacts directly over local HTTP
- audiobook chapters can be downloaded or streamed directly from the Mac

### Remote mode

When requester is remote:

- helper uploads finished artifacts to temporary object storage
- requester receives artifact metadata and fetch URLs
- artifacts expire automatically after a defined retention period

### Retention

Recommended V1 policy:

- canonical generated artifacts live on the helper Mac
- remote copies are temporary and expire automatically
- completed remote artifacts are cleaned up aggressively to control cost

## State Model

### Helper states

- `disabled`
- `idle`
- `discoverable`
- `busy`
- `offline`
- `error`

### Job states

- `queued`
- `accepted`
- `preparing`
- `rendering`
- `uploading`
- `completed`
- `failed`
- `cancelled`

## User Experience

### Mac settings

The Mac app should provide:

- `Use this Mac as a Helper`
- capability summary
- local network status
- pending approvals
- storage usage for generated audio
- revoke/reset controls

### iPhone/iPad settings

The mobile app should provide:

- helper availability
- selected helper Mac
- last successful contact
- current job status

### Main product flow

1. User opens a document on iPhone.
2. User taps `Generate Audiobook`.
3. Linea selects the preferred helper Mac.
4. If local helper is available, the local path is used automatically.
5. The user sees progress.
6. Completed audio appears in the listening UI.

## Implementation Notes For This Repo

The current repo already contains service boundaries that map well to this spec.

Likely starting points:

- iOS document model: `apps/ios/Linea/Models/ReadableDocument.swift`
- library: `apps/ios/Linea/Services/DocumentLibrary.swift`
- import: `apps/ios/Linea/Services/PDFImportService.swift`
- OCR: `apps/ios/Linea/Services/OCRService.swift`
- speech placeholder: `apps/ios/Linea/Services/SpeechService.swift`
- document chunking: `apps/ios/Linea/Services/DocumentChunker.swift`

V1 should extract these into shared package APIs before adding a new macOS
target and helper runtime.

## Recommended V1 Sequence

1. Extract shared document and service packages.
2. Add native macOS target with helper settings.
3. Implement local-only `audio.generate`.
4. Add Bonjour discovery and direct local transport.
5. Add `ocr.document`.
6. Add Cloudflare presence and remote artifact fallback.

## Success Criteria

V1 is successful when:

- a user can request audiobook generation from iPhone or iPad
- a trusted Mac performs the work locally
- same-Wi-Fi mode is direct and fast
- remote mode works without making Linea a media relay
- the helper system remains small, understandable, and cheap to operate
