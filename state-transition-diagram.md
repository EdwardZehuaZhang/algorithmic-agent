# LUMI — State Transition Diagram

## States & Transitions

```
                    ┌─────────────────────────────────────┐
                    │                                     │
              stateTimer>180 && alertness<10              │
                    │                                     │
          ┌─────────▼────────┐                            │
          │                  │                            │
          │    D O R M A N T │◄───────────────────────────┤
          │                  │                            │
          └─────────┬────────┘                            │
                    │                                     │
       alertness>15 OR micLevel>0.1                       │
                    │                                     │
          ┌─────────▼────────┐                            │
          │                  │  stateTimer>180            │
          │    A  W  A  R  E │──&& alertness<10 ──────────►
          │                  │                            │
          └─────────┬────────┘           DORMANT          │
                    │                                     │
      alertness>40 OR micLevel>0.2                        │
                    │                                     │
          ┌─────────▼────────┐                            │
          │                  │  stateTimer>300            │
          │   C U R I O U S  │──&& alertness<20──►AWARE   │
          │                  │                            │
          └─────────┬────────┘                            │
                    │                                     │
    alertness>70 OR micLevel>0.4 OR isTouching            │
                    │                                     │
          ┌─────────▼────────┐                            │
          │                  │  stateTimer>240            │
          │   E X C I T E D  │──&& alertness<40──►CURIOUS │
          │                  │                            │
          └─────────┬────────┘                            │
                    │                                     │
        micLevel>0.7 OR alertness>90                      │
                    │                                     │
          ┌─────────▼────────┐                            │
          │                  │  stateTimer>120            │
          │  S T A R T L E D │──────────────────►CURIOUS  │
          │                  │                            │
          └──────────────────┘                            │
```

## Agent Properties

| Property | Range | Effect |
|----------|-------|--------|
| `energy` | 0–100 | Glow intensity, pulse speed, eye size |
| `alertness` | 0–100 | Body size, tentacle length, eye spread |
| `mood` | calm / curious / excited / startled | Color palette (cyan → blue → green → purple) |

## Inputs → State/Property Effects

| Input | Effect on Properties | State Trigger |
|-------|---------------------|---------------|
| Microphone (loud sound) | +energy, +alertness | dormant→aware, aware→curious, curious→excited, excited→startled |
| DeviceOrientation (tilt) | +alertness (proportional to tilt magnitude) | dormant→aware, escalates up |
| Touch (canvas) | +energy+15, +alertness+25 | curious→excited |
| FEED button | +energy+20 | →aware (or curious if alert>40) |
| CALM button | –alertness–40 | →aware |
| PLAY button | +alertness+50 | →excited |

## Visual State Indicators

| State | Mood | Color | Body Size | Tentacles | Expression |
|-------|------|-------|-----------|-----------|------------|
| dormant | calm | cyan | small, slow pulse | retracted | neutral |
| aware | calm | cyan | medium | partial | neutral |
| curious | curious | blue-cyan | medium-large | extended | small smile |
| excited | excited | green-cyan | large, fast pulse | fully extended + waving | big smile + particles |
| startled | startled | purple-magenta | large + jerk | max extension | O-mouth |

## Notes for Demo

- **Week 13 demo location:** SDE4 05-05 (DID Studio), April 17
- **Best on mobile:** Open https://algorithmic-agent.vercel.app on smartphone
- **Mic permission:** Required for sound reactivity — grant when prompted
- **Motion:** Tilt phone to move Lumi's pupils and raise alertness
- **Touch:** Tap canvas to stimulate Lumi directly
