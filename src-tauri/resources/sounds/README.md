# UI sounds

| File | Source | License |
|---|---|---|
| `copy.wav` | `drop_002.ogg` from [Interface Sounds](https://kenney.nl/assets/interface-sounds) by Kenney | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |

Converted to 16-bit mono PCM WAV at 44.1 kHz, 188 ms. Embedded with
`include_bytes!` in `src/infrastructure/bundled_sound.rs` and played when
something is copied. The former `click_002` cue was only 11 ms and was often
inaudible on Windows. Pasting is silent by design.
