## Linea iOS

Native iOS scaffold for Linea's reading-first experience.

This app borrows:

- Scout's lightweight project shape: `App / Models / Services / Views / Resources`
- Talkie's intake primitives: scan, OCR, auth, speech, and conversation service boundaries

Current focus:

- import PDFs, text files, images, URLs, and scans
- normalize everything into one `ReadableDocument` model
- persist the local library
- provide reader, listening, and document chat bones

### Generate the Xcode project

```bash
cd /Users/arach/dev/linea/apps/ios
xcodegen generate
open Linea.xcodeproj
```

### Build from the command line

```bash
cd /Users/arach/dev/linea/apps/ios
xcodebuild -project Linea.xcodeproj -scheme LineaApp -destination 'platform=iOS Simulator,name=iPhone 16' build
```
