# 🎛️ SK-R1 OPERATOR
### Teenage Engineering × Casio SK-1 for Rabbit R1

[![rabbitOS Creations](https://img.shields.io/badge/rabbitOS-Creations%20SDK-FE5000?style=for-the-badge&logo=rabbit&logoColor=white)](https://github.com/rabbit-hmi-oss/creations-sdk)
[![Live Demo](https://img.shields.io/badge/Live%20Demo-GitHub%20Pages-00E5FF?style=for-the-badge)](https://anxand.github.io/sk-r1-operator/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](LICENSE)

A dedicated pocket music workstation, field sampler, and tape looper engineered specifically for the **Rabbit R1**'s tactile mechanical hardware: its notched physical scroll wheel, side push-to-talk (PTT) button, 3-axis accelerometer, and 240×282 display.

---

## 📲 Install on Rabbit R1 (Instant Scan)

Point your Rabbit R1 camera at the QR code below to install and launch **SK-R1 Operator**:

<div align="center">
  <img src="r1_pairing_qr.png" alt="Rabbit R1 Pairing QR Code" width="260" height="260" />
  <p><b>Scan with Rabbit R1 to install</b></p>
  <p>Live URL: <code>https://anxand.github.io/sk-r1-operator/</code></p>
</div>

---

## 🕹️ Hardware Controls & Mappings

The device features three distinct operating modes. Switch between them with the bottom-left **`[MODE]`** button. Each engine maintains its own **independent sound profile** (Pitch, Tone, Delay, and BPM/Timbre):

| Hardware Control | 1. SYNTH Mode | 2. SAMPLER Mode | 3. TAPE Mode (Looper & Drums) |
| :--- | :--- | :--- | :--- |
| **Scroll Wheel (Parameter Dial)** | Adjusts selected parameter tab (**PITCH**, **TONE**, **DELAY**) | Adjusts selected parameter tab (**PITCH**, **TONE**, **DELAY**) | Adjusts selected tab (**BPM**, **PITCH / VARISPEED**, **TONE**, **DELAY**) |
| **Side Button (PTT Tap)** | Triggers active note envelope | Triggers chromatic sample playback | **Toggles Loop Play / Pause** |
| **Side Button (PTT Hold)** | Sustains continuous drone note | **Records live audio from built-in mic** | **Triggers Analog Tape Stop** |
| **Side Button (PTT Release)**| Releases drone note | Stops mic recording & maps chromatically | Restarts tape playback motor |
| **Tilt X (Roll Left/Right)** | Sweeps 24dB Lowpass Filter (100Hz–9kHz) | Sweeps Lowpass Filter on sample | Sweeps Lowpass Filter on master loop |
| **Tilt Y (Pitch Forward/Back)**| Modulates Filter Resonance / FM depth | Modulates Sample Filter Resonance | Modulates Tape Saturation / Resonance |
| **Touchscreen 4-Pads** | Plays Root, Minor 3rd, 5th, Octave | Plays Sample at Root, +3st, +7st, +12st | **Plays & Records Kick, Snare, Hi-Hat, Clap** |
| **Top-Right `[WAV]` Button** | Opens QR Export Modal | Opens QR Export Modal | **Exports Master Loop to WAV via QR** |

### 🎚️ Parameter Selector Tabs
Tap any tab above the oscilloscope to assign the **physical scroll wheel**:
* **BPM (Tape Mode Only)**: Dial loop tempo from 50 to 180 BPM in 2-BPM increments. Loop audio is seamlessly resampled.
* **PITCH**: Adjusts synth notes/scale, chromatic sample pitch (-24 to +24 semitones), or tape varispeed.
* **TONE**: Sweeps the lowpass filter cutoff frequency ($120\text{ Hz}$ to $9500\text{ Hz}$) with tilt modulation.
* **DELAY**: Controls the dedicated space echo feedback and wet blend ($0\%$ to $100\%$).
* **Isolated Profiles**: Tweak settings in Synth mode, jump to Tape or Sampler mode, and return to Synth without losing your customized tone or delay values.

---

## ⚡ The Three Engines

### 1. Hybrid Synthesizer (`SYNTH`)
* **5 Selectable Timbres**: Pure Sawtooth, Square wave with pulse width, Warm Triangle, Sine, and a **2-Operator FM Synthesizer** (carrier modulated by harmonic ratio).
* **Kinetic Tilt Lowpass Filter**: Tilting the R1 left/right sweeps an analog-modeled 24dB lowpass filter cutoff ($100\text{ Hz}$ to $9,000\text{ Hz}$) with zero stepping noise using real-time linear interpolation (`lerp`).
* **Resonance & FM Modulation**: Tilting forward/back drives filter resonance ($Q: 0.5$ to $14.0$) and pushes FM operator modulation depth.
* **Scale Quantizer**: Quantizes physical scroll wheel steps into musical scales (Minor Pentatonic, Major Pentatonic, Blues, Insen, and Dorian).

### 2. Field Sampler (`SAMPLER`)
* **One-Touch Microphone Sampling**: Hold the side PTT button to record ambient sounds, vocals, or percussive hits directly from the R1 microphone.
* **Auto-Normalization & Chromatic Pitching**: Upon release, the captured audio is normalized to $-0.5\text{ dB}$ peak gain and chromatically mapped across musical intervals.
* **Scroll-Wheel Scrubbing**: Rotate the physical scroll wheel to scrub the sample start offset frame-by-frame through the recorded audio buffer.

### 3. Pocket Tape Looper & Vintage Drum Synth (`TAPE`)
* **Sound-on-Sound Magnetic Tape Overdub**: Tap `[OVERDUB]` to layer recordings onto the circulating loop buffer with vintage analog magnetic decay (`0.94` feedback multiplier).
* **Casio SK / 808 Style Drums**: The 4 touch pads become immediate drum synthesizers:
  * **Pad 1 [KICK]**: Pitch-dropped sine sweep ($160\text{ Hz} \rightarrow 36\text{ Hz}$) with punchy attack.
  * **Pad 2 [SNARE]**: Tuned $190\text{ Hz}$ triangle tone + snappy bandpass noise burst ($1250\text{ Hz}$).
  * **Pad 3 [HI-HAT]**: Highpass metallic noise cluster ($7500\text{ Hz}$).
  * **Pad 4 [CLAP]**: Triple-pulsed filtered noise burst.
* **Analog Tape Stop Effect**: Hold the side PTT button or tap `[TAPE STOP]`. The tape motor slows down exponentially, plunging pitch down to zero. Release to spin the reel back up.
* **Visual Tape Playhead**: The 60 FPS CRT vector oscilloscope displays a live vertical tape head tracking loop position in real time.

---

## 📡 Master WAV Export via QR Code

Getting music recordings off the Rabbit R1 without cables or complex developer tools:

1. Tap the **`[WAV]`** pill in the top-right status bar.
2. The engine serializes the master tape performance into an uncompressed **16-bit 44.1kHz Stereo WAV** file in memory.
3. It generates an ephemeral cloud download link and displays a crisp **QR Code** directly on the R1 screen.
4. **Point your phone camera at the R1 display, tap the notification banner, and your song drops directly into your phone’s files or DAW.**

---

## 📐 Architecture & Constraints

| Parameter | Specification |
| :--- | :--- |
| **Viewport** | Strictly **240 × 282 pixels** (Rabbit R1 screen) |
| **Styling** | Teenage Engineering matte-black (`#0c0d0e`), safety-orange (`#fe5000`), and Casio retro-cyan (`#00e5ff`) |
| **Visualizer** | 60 FPS CRT vector beam oscilloscope rendered onto a 240×56 HTML5 `<canvas>` |
| **Audio Pipeline** | Web Audio API (`AudioContext`, `BiquadFilterNode`, `WaveShaperNode`, `ScriptProcessorNode`) |
| **Sensors** | Native Rabbit R1 Accelerometer stream (`window.creationSensors.accelerometer`) at 60Hz |
| **Dependencies** | Zero external frameworks; vanilla JavaScript and embedded `qrcode.min.js` |

---

## 💻 Local Development & Desktop Emulation

To test and play with the app on your computer:

```bash
git clone https://github.com/AnxAnd/sk-r1-operator.git
cd sk-r1-operator
python3 -m http.server 8080
```

1. Open `http://localhost:8080` in your browser.
2. Open DevTools and set the viewport to **240 × 282** pixels.
3. Click **"TAP TO ENGAGE"** to unlock the audio context.
4. **Desktop Controls**:
   * **Up / Down Arrows or Mouse Wheel**: Simulates R1 Scroll Wheel.
   * **Spacebar (Tap / Hold)**: Simulates Side Button (PTT click / hold).
   * **Mouse Cursor Position**: Simulates R1 Accelerometer Tilt X/Y.
   * **On-Screen Pads**: Click or tap to trigger notes and drums.

---

## 📄 License

MIT License. Inspired by Teenage Engineering (OP-1 / Pocket Operator) and Casio (SK-1). Built for the Rabbit R1 community.
