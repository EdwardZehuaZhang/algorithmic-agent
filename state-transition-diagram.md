# LUMI — State Transition Diagram

## Architecture

The agent has two layers:

1. **Core progression** — a linear escalation chain driven by alertness, mic, and touch. Each state decays back down after a timeout.
2. **Reactive overrides** — three states that can interrupt *any* core state based on specific sensor signals. Priority: **dizzy > scared > angry > normal**. Each recovers back to `aware` once its trigger releases.

```
          CORE PROGRESSION                 REACTIVE OVERRIDES
          (escalation chain)               (interrupt any state)

          ┌──────────────┐
          │   DORMANT    │◄──┐
          │  mood: calm  │   │                ┌──────────────┐
          └──────┬───────┘   │                │    DIZZY     │
        alert>15 │           │           ┌───►│   (yellow)   │
        or      │            │           │    │ spiral pupils│
        mic>0.1 ▼            │  timer>180│    └──────┬───────┘
          ┌──────────────┐   │  alert<10 │ shake>18  │ shake<4
          │    AWARE     │───┘           │           │ &&timer>90
          │  mood: calm  │◄──────────────┤           │
          └──────┬───────┘               │           ▼
        alert>40 │           ▲           │    ┌──────────────┐
        or      │            │           │    │    SCARED    │
        mic>0.2 ▼            │ timer>300 ├───►│   (orange)   │
          ┌──────────────┐   │ alert<20  │    │ cowers, wide │
          │   CURIOUS    │───┘           │    │ eyes, tremble│
          │  mood:       │◄──────────────┤    └──────┬───────┘
          │  curious     │               │ mic>0.35  │ mic<0.2
          └──────┬───────┘               │ sustained │ &&timer>45
        alert>70 │           ▲           │           │
        mic>0.4 │            │           │           ▼
        touch  ▼             │ timer>240 │    ┌──────────────┐
          ┌──────────────┐   │ alert<40  │    │    ANGRY     │
          │   EXCITED    │───┘           │    │    (red)     │
          │ mood: excited│◄──────────────┴───►│ brows, frown,│
          │ + particles  │                    │    jitter    │
          └──────┬───────┘                    └──────┬───────┘
        mic>0.7  │           ▲             cam cover │ !cover
        alert>90 ▼           │             (dark +   │ &&timer>60
          ┌──────────────┐   │              uniform)  │
          │   STARTLED   │───┘
          │ mood:        │  timer>120
          │ startled     │
          └──────────────┘
```

Reactive overrides all recover to **AWARE** (dashed arrows back to the left column in the SVG).

## States

| State | Kind | Mood color | Body | Face | Trigger | Exit |
|-------|------|------------|------|------|---------|------|
| `dormant` | core | cyan (h180) | small, slow pulse | neutral line | initial / decay from aware | alert>15 OR mic>0.1 |
| `aware` | core | cyan (h200) | medium | neutral | up from dormant, recovery target | alert>40 OR mic>0.2 · decays to dormant |
| `curious` | core | blue (h200) | medium-large | small smile | alert>40 OR mic>0.2 | alert>70 OR mic>0.4 OR touch · decays to aware |
| `excited` | core | green (h160) | large, fast pulse | big smile + particles | alert>70 OR mic>0.4 OR touch | mic>0.7 OR alert>90 · decays to curious |
| `startled` | core | purple (h280) | large + jerk | O-mouth | mic>0.7 OR alert>90 | timer>120 → curious |
| **`dizzy`** | **override** | **yellow (h50)** | wobble | spiral pupils, wavy mouth | `shakeIntensity > 18` | shake<4 && timer>90 → aware |
| **`scared`** | **override** | **orange (h25)** | cowers + tremble | wide eyes, quivering O | `micLevel > 0.35` sustained ≥3 frames | mic<0.2 && timer>45 → aware |
| **`angry`** | **override** | **red (h0)** | jitter | diagonal eyebrows, gritted frown | `camCovered` (brightness<0.18 OR (<0.35 && variance<0.06)) | !covered && timer>60 → aware |

## Inputs → Signals → States

| Input | Raw signal | Derived | Drives |
|-------|------------|---------|--------|
| Microphone | `AnalyserNode.getByteTimeDomainData` | `micLevel` = RMS × 3.5 (fast attack, slow release) | energy, alertness, core escalation, **SCARED** |
| DeviceOrientation | `beta` / `gamma` | `tiltX`, `tiltY` | alertness, pupil offset |
| DeviceMotion | Δ of `accelerationIncludingGravity` | `shakeIntensity` (accumulated, lerp→0) | **DIZZY** |
| Camera | `getUserMedia` → sampled 32×24 canvas | `camBrightness`, `camVariance`, `camCoverFrames` | **ANGRY** |
| Touch / mouse | canvas events | `isTouching`, `touchX/Y` | energy, alertness, curious→excited |
| Feed / Calm / Play | buttons | direct | energy±, alertness±, force state |
| Mouse (desktop) | rapid direction reversals | `shakeIntensity` fallback | **DIZZY** |

## Properties

| Property | Range | Affects |
|----------|-------|---------|
| `energy` | 0–100 | glow intensity, pulse frequency, eye size |
| `alertness` | 0–100 | body radius, tentacle length, eye spread |
| `mood` | 8 labels | color palette |
| `stateTimer` | frames | decay gates, recovery gates |
| `loudFrames` | 0–30 | mic-loudness debounce for SCARED |
| `camCoverFrames` | 0–120 | camera-cover debounce for ANGRY |
| `shakeIntensity` | 0–60 | shake-accumulator for DIZZY |

## Priority semantics

At every tick, `updateState` evaluates overrides top-to-bottom:

```
if  shakeIntensity > 18  → DIZZY   (beats everything, including angry)
elif isLoud              → SCARED  (beats angry)
elif camCovered          → ANGRY
else                     → normal progression
```

Once in an override, lower-priority overrides are ignored until the current one recovers. Each override has its own recovery gate so it doesn't ping-pong on noisy sensors.

## Demo notes

- **Cover the lens** with a finger → `ANGRY` in ~0.5s (brightness + uniformity detection beats auto-exposure gain).
- **Shake the device** (or violently shake the mouse on desktop) → `DIZZY`.
- **Clap / shout** → `SCARED`. Keeping a steady voice progresses through `aware → curious → excited → startled`.
- Live `b= v= mic= shake=` readout at the bottom of the UI for calibration.
