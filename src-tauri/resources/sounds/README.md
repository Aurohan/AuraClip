# UI sounds

| File | Source | License |
|---|---|---|
| Copy playback | `drop_002.ogg` from [Interface Sounds](https://kenney.nl/assets/interface-sounds) by Kenney. The former `click_002.ogg` cue was only 11 ms and too short to hear reliably on Windows. | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `paste.wav` | `drop_002.ogg` from [Interface Sounds](https://kenney.nl/assets/interface-sounds) by Kenney | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |

Converted to 16-bit mono PCM WAV at 44.1 kHz (`drop_002` had identical
channels). Both are embedded with `include_bytes!` and played on every
platform; they replaced copies of macOS system sounds, which may not be
redistributed in a Windows build.
