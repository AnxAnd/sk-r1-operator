# 🎛️ SK-R1 OPERATOR
### Teenage Engineering × Casio SK-1 for Rabbit R1

[![rabbitOS Creations](https://img.shields.io/badge/rabbitOS-Creations%20SDK-FE5000?style=for-the-badge&logo=rabbit&logoColor=white)](https://github.com/rabbit-hmi-oss/creations-sdk)
[![Live Demo](https://img.shields.io/badge/Live%20Demo-GitHub%20Pages-00E5FF?style=for-the-badge)](https://anxand.github.io/sk-r1-operator/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](LICENSE)

A dedicated pocket music workstation, field sampler, and tape looper engineered specifically for the **Rabbit R1**'s tactile mechanical hardware: its notched physical scroll wheel, side push-to-talk (PTT) button, 3-axis accelerometer, and 240×282 display.

---

## 📲 Install on Rabbit R1 (Instant Scan)

Point your Rabbit R1 camera at the QR code below to launch **SK-R1 Operator**:

<div align="center">
  <img src="r1_pairing_qr.png" alt="Rabbit R1 Pairing QR Code" width="260" height="260" />
  <p><b>Scan with Rabbit R1 to install</b></p>
  <p>Live URL: <code>https://anxand.github.io/sk-r1-operator/</code></p>
</div>

---

## ✨ Key Features & Architecture

* **Zero-Click Micro-Envelopes**: Built with anti-click audio DSP—all voice triggers use ultra-fast 3ms linear attack ramps and 4ms voice-stealing fade-outs, eliminating leading-edge clicks and DC pops on pads and samples.
* **Independent Sound Profiles**: Each mode (`SYNTH`, `SAMPLER`, `TAPE`) maintains its own isolated sound state (Pitch, Tone, Delay, and Timbre/BPM). Tweak settings in one engine, jump between modes, and return without parameter bleed or reset.
* **Vintage Space Echo FX Bus**: Dedicated delay processor featuring a 2.4kHz high-cut damping filter and variable feedback loop, delivering authentic magnetic tape saturation and echo.
* **Non-Destructive BPM Tempo Resampling**: Dial loop tempo from 50 to 180 BPM in Tape mode. Any recorded loops are seamlessly resampled via linear interpolation, preserving your takes across tempo changes.
* **Kinetic Tilt Filter & FM Modulation**: Tilting the R1 left/right sweeps the analog lowpass filter (100Hz–9.5kHz) with 60Hz linear interpolation (`lerp`), while forward/back tilt modulates filter resonance ($Q: 0.5$ to $14.0$) and FM operator depth.
* **Instant Master WAV Export via QR Code**: Render your session into a 16-bit 44.1kHz Stereo WAV and beam it straight to your phone camera via QR code.

---

## ⚡ The Three Engines

Switch between engines anytime using the bottom-left **`[MODE]`** button:

```
[SYNTH] ──▶ [SAMPLER] ──▶ [TAPE] ──▶ (Cycles)
```

### 1. Hybrid Synthesizer (`SYNTH`)
* **5 Selectable Timbres**: Cycle through Pure Sawtooth, Square wave with pulse width, Warm Triangle, Sine, and 2-Operator FM Synthesis using the **`[TIMBRE]`** button.
* **Scale Quantizer & Notes**: Quantizes scroll wheel steps into musical scales (Minor Pentatonic, Major Pentatonic, Blues, Insen, Dorian).
* **4 Performance Pads**:
  * **Pad 1 [ROOT]**: Tonic note of active scale and octave.
  * **Pad 2 [+3RD]**: Minor / Major third interval.
  * **Pad 3 [+5TH]**: Perfect fifth harmony.
  * **Pad 4 [+OCT]**: Octave lead.
* **Drone / Sustain**: Tap **`[DRONE]`** (or hold side PTT) to lock a continuous synth drone while tweaking filter cutoff and space echo.

### 2. Field Sampler (`SAMPLER`)
* **One-Touch Field Recording**: Tap **`[TAP REC]`** on screen or hold the side PTT button to record audio directly from the Rabbit R1 microphone. Auto-normalizes to $-0.5\text{ dB}$ peak on release.
* **Chromatic Pitch Mapping**: Captured samples are automatically tuned across the 4 touch pads:
  * **Pad 1 [ROOT]**: Original pitch.
  * **Pad 2 [+3ST]**: +3 semitones (Minor 3rd).
  * **Pad 3 [+7ST]**: +7 semitones (Fifth).
  * **Pad 4 [+12ST]**: +12 semitones (Octave).
* **Dedicated Tone & Space Echo**: Sculpt your sample with its own dedicated lowpass filter cutoff and space echo mix.
* **Pitch Reset**: Tap the center **`[RESET]`** button anytime to return pitch shift to 0 semitones.

### 3. Pocket Tape Looper & Drum Synth (`TAPE`)
* **Magnetic Sound-on-Sound Overdub**: Tap **`[OVERDUB]`** to layer live takes onto an 8-beat loop with vintage magnetic tape decay (`0.94` feedback multiplier).
* **4 Dedicated Drum Synthesizers**:
  * **Pad 1 [KICK]**: Pitch-swept analog sine burst ($160\text{ Hz} \rightarrow 36\text{ Hz}$) with punchy transient.
  * **Pad 2 [SNARE]**: Tuned $190\text{ Hz}$ tone layered with snappy $1250\text{ Hz}$ bandpass noise burst.
  * **Pad 3 [HI-HAT]**: Crisp $7500\text{ Hz}$ highpass metallic noise cluster.
  * **Pad 4 [CLAP]**: Triple-pulsed vintage filtered noise burst.
* **Analog Tape Stop / Motor Brake**: Tap **`[TAPE STOP]`** or hold side PTT to brake the tape motor to an exponential halt; release or tap **`[TAPE START]`** to spin the reel back up.
* **Live CRT Playhead**: The 60 FPS oscilloscope displays a glowing tape head marker tracking loop position in real time.

---

## 🎚️ Parameter Selector Tabs

The parameter bar above the oscilloscope directs the **physical scroll wheel**:

| Tab | Active Mode | Scroll Wheel Action | Telemetry Readout | Range |
| :--- | :--- | :--- | :--- | :--- |
| **`BPM`** | `TAPE` only | Adjusts loop tempo & resamples buffer | `LOOP TEMPO:` | `50 – 180 BPM` ($\pm 2$) |
| **`PITCH`** | `SYNTH` | Steps notes through musical scale | `SYNTH PITCH:` | Full scale octave range |
| **`PITCH`** | `SAMPLER` | Shifts sample pitch chromatically | `SMPL PITCH:` | `-24 to +24 ST` |
| **`PITCH`** | `TAPE` | Varispeed tape pitch & speed | `VARISPEED:` | `-24 to +24 ST` |
| **`TONE`** | All modes | Adjusts lowpass filter cutoff frequency | `SYNTH / SMPL / TAPE FILTER:` | `120 – 9500 Hz` ($\pm 250\text{Hz}$) |
| **`DELAY`** | All modes | Adjusts space echo feedback & wet blend | `ECHO MIX / TAPE ECHO:` | `0% – 100%` ($\pm 5\%$) |

> **Note**: In `SYNTH` and `SAMPLER` modes, the layout displays 3 tabs (`PITCH | TONE | DELAY`). Entering `TAPE` mode dynamically activates the 4-tab layout (`BPM | PITCH | TONE | DELAY`).

---

## 🕹️ Rabbit R1 Hardware Mappings

| Hardware Control | Behavior |
| :--- | :--- |
| **Physical Scroll Wheel** | Adjusts the currently selected parameter tab (`BPM`, `PITCH`, `TONE`, or `DELAY`). |
| **Side Button (PTT Tap)** | Triggers active note in `SYNTH`, plays sample in `SAMPLER`, or toggles Play/Pause in `TAPE`. |
| **Side Button (PTT Hold)** | Sustains drone in `SYNTH`, records live microphone in `SAMPLER`, or triggers analog Tape Stop in `TAPE`. |
| **Side Button (PTT Release)**| Releases drone note in `SYNTH`, stops mic recording in `SAMPLER`, or spins motor back up in `TAPE`. |
| **Accelerometer Tilt X (Roll)** | Sweeps lowpass filter cutoff frequency smoothly in real time. |
| **Accelerometer Tilt Y (Pitch)** | Modulates filter resonance ($Q$) and FM modulation depth. |
| **Touchscreen 4-Pads** | Plays scale notes, pitched samples, or drum machine voices (Kick, Snare, Hi-Hat, Clap). |
| **Top-Right `[WAV]` Pill** | Renders 16-bit 44.1kHz Stereo WAV and displays phone camera QR download modal. |

---

## 📡 Master WAV Export via QR Code

Exporting music from the Rabbit R1 requires no cables or developer tools:

1. Tap the **`[WAV]`** button in the top-right status bar.
2. The engine serializes the master session into an uncompressed **16-bit 44.1kHz Stereo WAV**.
3. It generates an ephemeral cloud download link and displays a high-contrast **QR Code** directly on the screen.
4. **Scan the R1 screen with your smartphone camera to immediately download the WAV file to your phone's storage or DAW.**

---

## 📐 Technical Specifications

| Component | Specification |
| :--- | :--- |
| **Target Device** | Rabbit R1 (rabbitOS Creations Web Environment) |
| **Viewport** | Strictly **240 × 282 pixels** (no scrollbars, zero viewport bleed) |
| **Styling** | Teenage Engineering matte-black (`#0c0d0e`), safety-orange (`#fe5000`), and retro-cyan (`#00e5ff`) |
| **Visualizer** | 60 FPS CRT vector beam oscilloscope with live tape playhead tracking (HTML5 Canvas) |
| **Audio Architecture** | Web Audio API (`AudioContext`, `BiquadFilterNode`, `DelayNode`, `ScriptProcessorNode`, `WaveShaperNode`) |
| **Sensors** | Rabbit R1 accelerometer stream (`window.creationSensors.accelerometer`) |
| **Dependencies** | Pure Vanilla JavaScript, HTML5, CSS3. Zero runtime frameworks. Embedded QR encoder. |

---

## 💻 Desktop Emulation & Development

To run and test locally on desktop:

```bash
git clone https://github.com/AnxAnd/sk-r1-operator.git
cd sk-r1-operator
python3 -m http.server 8080
```

1. Open `http://localhost:8080` in Chrome or Firefox.
2. Open DevTools (F12) and toggle device mode set to **240 × 282** pixels.
3. Click **"TAP TO ENGAGE"** to unlock the Web Audio Context.
4. **Desktop Keybindings**:
   * **Up / Down Arrow Keys or Mouse Wheel**: Controls physical scroll wheel for selected tab.
   * **Spacebar (Tap / Hold)**: Simulates side PTT button (trigger, sample recording, or tape stop).
   * **Mouse Cursor Movement**: Simulates R1 3-axis accelerometer tilt.
   * **Mouse Clicks / Taps**: Triggers pads and buttons.

---

## 📄 License

MIT License. Designed and engineered for the Rabbit R1 creations ecosystem. Inspired by Teenage Engineering and Casio.
