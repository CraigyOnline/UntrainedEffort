# Untrained Effort

An open-source, local-first Android workout tracker built for people who want to focus on training—not subscriptions, social feeds, or paywalls.

Inspired by apps like **Hevy** and **wger**, with an emphasis on speed, ownership of your data, and a polished workout experience.

---

## Philosophy

- 🏋️ **Local-first** — your data stays on your device.
- 📈 **Progress over perfection** — celebrate consistency and long-term improvement.
- 🚫 **No subscriptions**
- 🚫 **No feature paywalls**
- 🚫 **No social feed**
- 📂 **Backup and restore whenever you want**
- ❤️ **Built with maintainability in mind**

---

## Features

### Workouts

- Workout routines
- Manual routine ordering
- Quick workouts
- Live Workout HUD
- Active workout recovery
- Active workout card
- Exercise reordering during workouts
- Optional routine synchronisation
- Rich Android workout notifications
- Automatic rest timers, tuned per exercise, with per-exercise overrides
- Cardio & interval workouts, tracked in the right unit for each activity (km, meters, floors)
- A wide and growing exercise library, spanning strength, functional, and cardio movements
- Unilateral exercise support

### Progress

- Workout history
- Search & filtering
- Personal records (PRs)
- Exercise progress charts
- Exercise detail pages
- Browse & search the full exercise library
- Profile dashboard
- Muscle activity maps
- Workout completion celebrations
- Motivational welcome & completion messages

### Data

- Local-first database
- Backup & restore
- Database maintenance
- Automatic derived-data synchronisation

---

## Roadmap

### Analytics

- Weekly & monthly volume charts
- Richer exercise statistics
- Cardio pace & speed metrics
- Muscle activity trends
- **Volume PR tracking** — second PR type alongside existing best-ever-weight PR: best-ever single-set volume (weight × reps) per exercise. New trigger in `completionMessages.ts`, separate from the existing PR trigger, so a workout without a weight PR can still earn a PR moment. Own message pool, following the existing "pair fact with recognition" rule.
- **Muscle heatmap date-range filtering** — extend `MuscleMap` with an aggregated view over a user-selected date range, for a History/Insights screen. New aggregate mode, distinct from the existing per-workout/routine `compact` thumbnails.
- **Trend confidence indicators** — when surfacing any trend in this section, attach a short confidence qualifier plus one line of supporting evidence rather than asserting the trend flatly.

### Insights

- Muscle recovery indicators
- Training frequency
- Last trained by muscle
- **Plateau detection** — flag when an exercise's weight/volume trend has stalled over recent sessions. Calm, non-judgmental tone only — no "stuck" framing, more like gentle encouragement or a suggestion to switch things up.
- **Session goal detection** — classify a completed workout as Strength/Hypertrophy/Endurance/Mixed from its rep-range distribution. Derived data computed alongside existing workout stats; feeds into completion messages as a new contextual input, additive to the baseline message.

### Future

- Goal tracking
- Optional cloud sync
- Wear OS support
- Illustrated exercise form guidance (start/end position art)
- **Fatigue-aware expected rep range** — live, set-by-set expected rep range in the Workout HUD based on rolling recent performance for that exercise. Larger feature needing its own live-session UI treatment — a future phase, not a quick add.
- **Shareable progress card** — export-to-image card combining workout stats and the muscle map, offered as an optional action after the Workout Complete acknowledgment/stats reveal. Reuse `workoutStats.ts` and `MuscleMap` rather than duplicating logic.

---

## Contributing

This project is developed primarily for personal use, but ideas, bug reports and pull requests are always welcome.

---

## License

Untrained Effort is licensed under the GNU General Public License v3.0 (GPL-3.0).
