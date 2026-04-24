## Linea macOS

Native macOS scaffold for the future `Helper Mac` experience.

This target is intentionally small for now. Its job is to give us a real
native surface to grow into:

- library shell
- helper Mac settings
- local job queue UI
- device trust / approval

### Generate the Xcode project

```bash
cd /Users/arach/dev/linea/apps/macos
xcodegen generate
open LineaMac.xcodeproj
```

### Build from the command line

```bash
cd /Users/arach/dev/linea/apps/macos
xcodebuild -project LineaMac.xcodeproj -scheme LineaMacApp -destination 'platform=macOS' build
```
