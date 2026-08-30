/**
 * "How to do this" content shown under the setup/movement images in
 * ExerciseFormViewer. Covers every exercise in the catalog — writing
 * this doesn't depend on having real photos, unlike the images
 * themselves (which get added exercise-by-exercise as they're generated;
 * see hasExerciseImages in exerciseImages.ts). An entry existing here
 * doesn't imply an image exists yet for that exercise — ExerciseFormViewer
 * shows whichever of the two it has.
 *
 * "movement" describes the working position/action for most exercises,
 * but reads differently for two groups:
 *  - Holds (plank, wall sit, dead hang, hollow hold, l-sit, side plank):
 *    there's no second position, so it describes what to maintain during
 *    the hold rather than a distinct end point.
 *  - Steady-state cardio (treadmill, bike, rowing machine, ...): it's an
 *    ongoing form cue for the activity rather than a single rep.
 *
 * "cues" are the specific technique points and common-mistake-avoidance
 * that make the exercise effective — optional and variable length.
 * Omitted where setup/movement already cover what matters; most
 * exercises need 1-3, a few need none.
 *
 * "warning" is one genuinely important technique or safety point,
 * visually distinguished in the UI (see WarningSeverity). Optional and
 * rare by design — most exercises should have none. Where a family of
 * exercises shares a real mechanism (e.g. barbell bench press variants
 * and the risk of getting pinned under a failed rep), each gets its own
 * warning worded for its specific setup rather than one copy-pasted
 * across all of them.
 */

export type WarningSeverity = "caution" | "important" | "safety";

export interface ExerciseWarning {
  severity: WarningSeverity;
  text: string;
}

export interface ExerciseFormNote {
  setup: string;
  movement: string;
  cues?: string[];
  warning?: ExerciseWarning;
}

export const EXERCISE_FORM_NOTES: Record<string, ExerciseFormNote> = {
  // Chest
  "bench-press": {
    setup:
      "Bar over your eyes at the bottom of the rack, feet flat on the floor, shoulder blades pulled together and down into the bench.",
    movement:
      "Unrack the bar over your chest, lower it under control to your mid-chest, then press it back up to full extension without locking out aggressively.",
    cues: [
      "Keep your feet flat and drive them into the floor — that's part of your stable base, not just your upper body.",
      "Keep your wrists stacked directly above your elbows at the bottom rather than bent back.",
      "Touch the bar to your chest lightly each rep rather than bouncing it off — the pause is what makes the next rep honest.",
    ],
    warning: {
      severity: "important",
      text: "Use the rack's safety pins or a spotter when working near your limit — bench press is one of the few lifts where a missed rep can trap the bar on your chest with no easy way out.",
    },
  },
  "incline-bench": {
    setup:
      "Bench set to a moderate incline (around 30–45°), bar lowered to your upper chest, shoulder blades pulled together and down.",
    movement:
      "Press the bar up and slightly back until your arms are extended, then lower it under control back to your upper chest.",
    cues: [
      "A steeper incline shifts more work to your front shoulders — if that's not the goal, keep the bench closer to 30°.",
      "Keep your wrists stacked over your elbows rather than letting them bend back under the bar's weight.",
    ],
    warning: {
      severity: "important",
      text: "Set the safety pins on your rack whenever you're pressing near your limit — the head-up angle makes it harder for a spotter to reach the bar cleanly than on a flat bench, so pins are worth relying on even more here.",
    },
  },
  "db-bench-press": {
    setup:
      "Lie back with feet flat on the floor, dumbbells at chest height with your upper arms around 45° from your torso.",
    movement:
      "Press both dumbbells up and slightly in until your arms are extended without locking out hard, then lower them under control back to chest height.",
    cues: [
      "Keep your shoulder blades pulled together and down into the bench — that's your stable base for the press.",
      "Lower to wherever gives you a comfortable stretch, usually around chest height — depth should be limited by comfort, not a fixed rule.",
      "Control the way down — don't let the dumbbells drop, that's when shoulders get tweaked on this exercise.",
    ],
    warning: {
      severity: "caution",
      text: "Keep your elbows around 45° from your torso rather than flared out to the sides — it's easier on the shoulders and keeps the tension on your chest.",
    },
  },
  "incline-db-bench-press": {
    setup:
      "Bench set to a moderate incline, dumbbells at upper-chest height with your upper arms around 45° from your torso.",
    movement:
      "Press both dumbbells up and slightly back until your arms are extended, then lower them under control back to your upper chest.",
    cues: [
      "Keep the incline moderate — too steep turns this into a shoulder press and shifts emphasis off your upper chest.",
      "Keep your elbows around 45° from your torso, same as flat dumbbell bench.",
      "Control the descent — don't let the stretch at the bottom go further than feels comfortable in your shoulders.",
    ],
  },
  "floor-press": {
    setup:
      "Lying on the floor, knees bent and feet flat, bar lowered until your upper arms rest on the ground.",
    movement:
      "Press the bar up until your arms are fully extended, then lower under control until your upper arms — not your elbows — touch the floor.",
    cues: [
      "The floor stops your elbows before your shoulder is at risk — that's the point of this variation, so don't arch your back to reach lower.",
      "Pause briefly when your arms touch the floor rather than bouncing straight back up.",
    ],
  },
  "db-floor-press": {
    setup:
      "Lying on the floor, knees bent and feet flat, dumbbells lowered until your upper arms rest on the ground.",
    movement:
      "Press both dumbbells up until your arms are extended, then lower under control until your upper arms touch the floor.",
    cues: [
      "Keep your elbows around 45° from your torso as they touch down, rather than flared out to the sides.",
      "This is a shorter range than a bench press by design — don't arch your back to chase extra depth.",
    ],
  },
  "chest-fly": {
    setup:
      "Lying on a flat bench, dumbbells pressed above your chest with a slight, fixed bend in your elbows.",
    movement:
      "Lower the dumbbells out to the sides in a wide arc until you feel a stretch across your chest, then bring them back together over your chest along the same path.",
    cues: [
      "Keep the bend in your elbows constant throughout — this is a hinge at the shoulder, not an elbow exercise.",
      "Lead the return with your chest, squeezing the dumbbells together rather than just reversing momentum.",
    ],
    warning: {
      severity: "caution",
      text: "Don't lower past a comfortable stretch. Going deeper than your shoulders are ready for is a common way this exercise irritates the front of the shoulder, and it doesn't add anything to the chest stimulus.",
    },
  },
  "db-pullover": {
    setup:
      "Lying across a bench so your head and shoulders are supported, hips lower than your shoulders, one dumbbell held with both hands above your chest.",
    movement:
      "Keeping a slight bend in your elbows, lower the dumbbell back over your head until you feel a stretch through your chest and lats, then pull it back over to above your chest.",
    cues: [
      "Keep your elbows fixed at a slight bend throughout — don't let them straighten or bend further as you lower.",
      "Move from your shoulders, not your lower back — avoid arching to chase extra range.",
    ],
    warning: {
      severity: "caution",
      text: "Lower only as far as feels like a controlled stretch. This exercise puts your shoulder in a vulnerable overhead position, so it's a good one to keep conservative on weight.",
    },
  },
  "cable-crossover": {
    setup:
      "Standing centred between the towers with cables set above head height, one foot slightly forward, arms out wide with a slight elbow bend.",
    movement:
      "Bring your hands together and down in front of your chest in a wide arc, then return under control to the starting position.",
    cues: [
      "Keep the slight elbow bend fixed throughout — bending your elbows more turns this into a press.",
      "Lean slightly forward from your stance rather than letting the cables pull your shoulders forward.",
    ],
  },
  "push-up": {
    setup:
      "Hands flat on the floor slightly wider than shoulder-width, body in a straight line from head to heels, core braced.",
    movement:
      "Lower your chest toward the floor by bending your elbows back at roughly 45° from your body, keeping your body rigid the whole way down. Push back up to full extension without letting your hips sag or pike up.",
    cues: [
      "Keep one straight line from head to heels — brace your core and squeeze your glutes so your hips don't sag or lift.",
      "Lower as far as you can control well — a shorter range with good form beats a full range with your hips caving.",
      "Keep your neck neutral, eyes slightly ahead of you rather than straight down.",
    ],
  },
  dip: {
    setup:
      "Arms locked out on the dip bars, shoulders over your hands, leaning your torso forward slightly.",
    movement:
      "Lower yourself until your upper arms are about parallel to the floor, then press back up to full lockout.",
    cues: [
      "Lean forward as you descend — a more upright torso shifts this toward triceps and reduces chest involvement.",
      "Control the descent rather than dropping — the bottom position is where the shoulder is most vulnerable.",
    ],
    warning: {
      severity: "caution",
      text: "Going deeper than upper-arms-parallel adds stretch but also shoulder strain for many people — treat depth as something to build into gradually, not a fixed target from day one.",
    },
  },
  "machine-chest-press": {
    setup:
      "Seated with your back flat against the pad, handles at chest height, feet flat on the floor.",
    movement:
      "Press the handles forward until your arms are extended without locking out hard, then return under control to chest height.",
    cues: [
      "Keep your shoulder blades pulled back against the pad throughout rather than rounding forward into the press.",
      "Adjust the seat so the handles line up with your mid-chest before you start.",
    ],
  },
  "decline-bench-press": {
    setup:
      "Lying on a decline bench with your feet secured, bar lowered to your lower chest, shoulder blades pulled together.",
    movement:
      "Press the bar up until your arms are fully extended, then lower it under control back to your lower chest.",
    cues: [
      "Keep the bar path angled slightly back toward your face — pressing straight up on a decline sends it off-line.",
    ],
    warning: {
      severity: "important",
      text: "Use a spotter or a rack with pins set for this angle. On a decline the bar finishes closer to your face than on a flat bench, so a missed rep is less forgiving.",
    },
  },
  "pec-deck": {
    setup:
      "Seated with your back against the pad, forearms or hands on the pads at chest height, seat adjusted so your shoulders don't hike up.",
    movement:
      "Bring the pads together in front of your chest, then return under control until you feel a stretch.",
    cues: [
      "Keep your back flat against the pad — arching forward to add range just shifts load to your shoulders.",
      "Control the return; don't let the weight stack yank your arms back.",
    ],
  },

  // Back
  deadlift: {
    setup:
      "Bar over your midfoot, shins almost touching it. Hinge your hips back, bend your knees, and grip the bar just outside your legs with straight arms, chest up and back flat.",
    movement:
      "Take the slack out of the bar, brace, then push the floor away with your legs — keep the bar brushing your shins as you rise. Finish by driving your hips forward, not leaning back, then reverse the same path to lower it under control.",
    cues: [
      "Keep the bar close to your body the whole rep — if it drifts forward, your lower back takes the extra load.",
      "Brace like you're about to take a punch to the stomach, and hold that brace until the rep's finished.",
      "Let your hips and shoulders rise together. If your hips shoot up first and your chest stays low, you're turning it into a stiff-leg row.",
    ],
    warning: {
      severity: "safety",
      text: "Keep your lower back flat, not rounded, for the whole lift — rounding under load is the most common way people hurt their back here. If you can't hold that position at a given weight, the fix is less weight, not forcing the rep.",
    },
  },
  "romanian-deadlift": {
    setup:
      "Stand tall holding the bar at hip height, feet hip-width apart, with a slight bend in your knees that you hold for the whole set.",
    movement:
      "Push your hips straight back while keeping the bar sliding down close to your legs — your knees stay softly bent, not bending further as you go. Lower until you feel a stretch through your hamstrings, then reverse by driving your hips forward to stand back up.",
    cues: [
      "This is a hip hinge, not a squat — your knee bend shouldn't increase once you start lowering.",
      "Your hamstring stretch sets your depth, not your hands reaching a certain point — stop wherever you feel it.",
    ],
    warning: {
      severity: "important",
      text: "Keep your back flat as you hinge. If it starts to round before you feel the stretch, that's your range for today — don't reach further to compensate.",
    },
  },
  "single-leg-romanian-deadlift": {
    setup: "Stand on one leg with a soft, fixed bend in that knee, dumbbell in the opposite hand.",
    movement:
      "Hinge forward at the hip while your free leg extends straight back behind you, lowering the dumbbell down your standing leg until your torso is roughly parallel to the floor. Reverse the movement by driving your hips forward to stand back up.",
    cues: [
      "Keep your hips square to the floor throughout — a common mistake is letting the hip on your standing-leg side rotate open as you fatigue.",
      "Move your torso and back leg together, like a see-saw around your hip — they should reach parallel to the floor at about the same time.",
      "Find a wall or the back of a chair to lightly touch for balance while you learn the movement; it's a balance skill as much as a strength one.",
    ],
  },
  "pull-up": {
    setup:
      "Hang from the bar with an overhand grip slightly wider than shoulder-width, arms fully extended, shoulders relaxed down away from your ears.",
    movement:
      "Pull yourself up by driving your elbows down toward your hips until your chin clears the bar, then lower back down under control to a full hang.",
    cues: [
      "Start each rep from a genuine dead hang rather than a partial one — that's where most of the range, and the benefit, is.",
      "Pull your elbows down and back rather than just up — that keeps your back doing the work instead of your arms.",
      "Control the way down. Dropping quickly from the top skips half the exercise.",
    ],
  },
  "chin-up": {
    setup:
      "Hang from the bar with an underhand grip roughly shoulder-width apart, arms fully extended.",
    movement:
      "Pull yourself up by driving your elbows down until your chin clears the bar, then lower back down under control to a full hang.",
    cues: [
      "The underhand grip lets your biceps assist more than a pull-up — expect this to feel a little easier at the same bodyweight.",
      "Keep your shoulders down and back at the top rather than shrugging up toward your ears.",
    ],
  },
  "lat-pulldown": {
    setup:
      "Seated with your thighs secured under the pads, bar held wide with an overhand grip, arms extended overhead.",
    movement:
      "Pull the bar down to your upper chest by driving your elbows down and back, then let it return under control to a full stretch overhead.",
    cues: [
      "Lean back slightly to let the bar clear your face, not to help pull the weight — if you're rocking your torso to move the bar, it's too heavy.",
      "Pull to your upper chest, not behind your neck — that position puts your shoulders in an awkward spot for no real benefit.",
    ],
    warning: {
      severity: "caution",
      text: "Keep the movement controlled on the way up as well as down — leaning back and using your bodyweight to yank the bar down is the most common way people turn this into a row instead of a lat exercise.",
    },
  },
  "seated-row": {
    setup:
      "Seated with your feet on the platform, knees slightly bent, arms extended toward the machine, back naturally upright.",
    movement:
      "Pull the handle to your torso by driving your elbows back, squeezing your shoulder blades together, then extend back out under control.",
    cues: [
      "Keep your torso upright throughout — rocking back and forth to add momentum takes the work away from your back.",
      "Lead with your elbows rather than just curling the handle in with your arms.",
    ],
  },
  "single-arm-cable-row": {
    setup: "Standing or half-kneeling side-on to the machine, one arm extended toward the cable.",
    movement:
      "Pull the handle to your ribs, driving your elbow back and rotating slightly through your torso, then extend back out under control.",
    cues: [
      "Let your torso rotate naturally with the pull rather than keeping it rigid — a small rotation is part of the movement, not a fault.",
      "Keep your core braced so the pull comes from your back and not from swinging your hips.",
    ],
  },
  "db-row": {
    setup:
      "One knee and hand supported on a bench, dumbbell hanging straight down from your other hand, back flat and roughly parallel to the floor.",
    movement:
      "Pull the dumbbell up to your hip, keeping your elbow close to your body, then lower it under control to a full stretch.",
    cues: [
      "Keep your back flat and roughly still — the movement happens at your arm and shoulder blade, not by twisting your torso.",
      "Pull to your hip, not your armpit — that keeps the angle working your lats rather than your upper traps.",
    ],
  },
  "chest-supported-db-row": {
    setup:
      "Chest and stomach against an incline bench, dumbbells hanging straight down, feet braced on the floor or bench legs.",
    movement:
      "Pull both dumbbells up toward your torso, squeezing your shoulder blades together, then lower under control to a full stretch.",
    cues: [
      "The bench takes your lower back out of the movement — use that to focus purely on pulling with your back, without needing to brace against momentum.",
      "Keep your neck relaxed and in line with your spine rather than craning up to see yourself.",
    ],
  },
  "barbell-row": {
    setup:
      "Hinged forward at the hips to about 45°, knees softly bent, bar hanging below your shoulders with an overhand grip, back flat.",
    movement:
      "Pull the bar up to your lower ribs by driving your elbows back, then lower it under control to a full stretch without letting your torso rise.",
    cues: [
      "Keep your torso angle fixed throughout the set — if it's rising and falling with each rep, you're using your hips to heave the weight rather than pulling with your back.",
      "Pull to your lower ribs, not your chest — that's the angle that keeps your elbows tracking back rather than out.",
    ],
    warning: {
      severity: "important",
      text: "Keep your back flat and your torso angle steady. This is a loaded hip hinge held under tension for the whole set, and the most common way people strain their lower back on it is letting the torso bounce or round to add momentum to the pull.",
    },
  },
  "t-bar-row": {
    setup:
      "Straddling the bar, hinged forward at the hips with a flat back, gripping the handles with arms extended toward the weight.",
    movement:
      "Pull the handles up to your torso, squeezing your shoulder blades together, then lower under control to a full stretch.",
    cues: [
      "Keep your torso angle fixed — the fixed pivot point of the bar can tempt you into standing up slightly with each rep instead of pulling with your back.",
      "Drive your elbows back and up rather than just curling the weight in with your arms.",
    ],
  },
  "face-pull": {
    setup:
      "Cable set above head height with a rope attachment, standing with arms extended forward at shoulder height.",
    movement:
      "Pull the rope apart toward your face, leading with your elbows high and squeezing your shoulder blades together, then return under control.",
    cues: [
      "Finish with your hands roughly level with your ears and your knuckles facing behind you — that rotation at the end is most of the point of this exercise.",
      "Keep your elbows high, roughly level with your shoulders, rather than letting them drop low.",
    ],
  },
  "back-extension": {
    setup:
      "Hips resting on the pad with the edge just below your hip crease, legs secured, torso hinged forward toward the floor.",
    movement:
      "Raise your torso by extending your hips until your body forms a straight line, then lower back down under control.",
    cues: ["Move from your hips, not by yanking your head and shoulders up first."],
    warning: {
      severity: "caution",
      text: "Stop at a straight line from your shoulders to your heels — hyperextending further into a lower-back arch at the top is a common way people load their spine unnecessarily here.",
    },
  },
  "sumo-deadlift": {
    setup:
      "Wide stance with toes turned out, shins close to vertical, hands gripping inside your knees, hips low, back flat.",
    movement:
      "Push your knees out in the direction of your toes and drive through the floor to stand fully upright, then reverse the same path to lower it.",
    cues: [
      "Push your knees out to make room for your hips to drop, rather than just bending your knees forward.",
      "Keep your torso more upright than a conventional deadlift — that's the point of the wider stance.",
    ],
    warning: {
      severity: "safety",
      text: "Keep your back flat, not rounded, for the whole lift — the wider stance changes where the load goes, but the risk of rounding under a heavy pull off the floor is the same as a conventional deadlift. If you can't hold the position, that's a signal to reduce the weight.",
    },
  },
  "trap-bar-deadlift": {
    setup:
      "Standing inside the frame with the bar's handles at your sides, hips back, flat back, gripping the handles at your sides rather than in front of you.",
    movement:
      "Drive through the floor and stand fully upright, then reverse the same path to lower it under control.",
    cues: [
      "The neutral, at-your-sides grip is more shoulder-friendly than a straight bar, but the hip-hinge technique is the same — this isn't a squat.",
      "Keep the weight centred through the middle of your foot as you stand up.",
    ],
    warning: {
      severity: "safety",
      text: "Keep your back flat through the whole lift. The trap bar's grip position makes this slightly more forgiving than a conventional deadlift, but rounding your back under a heavy pull off the floor carries the same risk.",
    },
  },
  "straight-arm-pulldown": {
    setup:
      "Standing facing the cable, arms extended overhead holding the bar with a slight bend in your elbows.",
    movement:
      "Pull the bar down to your thighs in an arc, keeping your arms straight, then let it return under control to overhead.",
    cues: [
      "Keep the slight elbow bend fixed throughout — this is a shoulder movement, not a triceps pushdown.",
      "Hinge slightly forward from your hips as the bar passes your hips, rather than staying rigidly upright.",
    ],
  },
  "assisted-pull-up": {
    setup:
      "Knees or feet resting on the platform, hands gripping the bar slightly wider than shoulder-width, arms extended.",
    movement:
      "Pull yourself up until your chin clears the bar, then lower back down under control to a full hang.",
    cues: [
      "Use just enough assistance to complete your reps with good form — too much makes the machine do the work instead of you.",
      "The technique is identical to an unassisted pull-up; treat this as practice for that, not a different exercise.",
    ],
  },

  // Shoulders
  ohp: {
    setup:
      "Bar racked at shoulder height, hands just outside shoulder-width, elbows slightly in front of the bar.",
    movement:
      "Press the bar overhead in a straight line, moving your head back slightly to let the bar pass, then reversing to bring it back to shoulder height.",
    cues: [
      "Squeeze your glutes and brace your core rather than leaning back to press the weight up — that's how your lower back ends up doing your shoulders' job.",
      "Once the bar clears your head, push your head through so it finishes stacked directly under the bar.",
    ],
    warning: {
      severity: "caution",
      text: "If pressing straight overhead pinches or feels uncomfortable in the front of your shoulder, that's common with limited overhead mobility — a slightly wider grip or switching to dumbbells, which let your arms find their own path, is often more comfortable than forcing it.",
    },
  },
  "db-shoulder-press": {
    setup:
      "Seated or standing, dumbbells at shoulder height, palms facing forward, elbows roughly under your wrists.",
    movement:
      "Press both dumbbells overhead until your arms are extended, then lower them under control back to shoulder height.",
    cues: [
      "Let the dumbbells travel slightly inward at the top rather than pressing them straight up on rigid, parallel paths.",
      "Keep your ribs down and avoid arching your lower back to finish the press.",
    ],
  },
  "single-arm-shoulder-press": {
    setup:
      "Standing or seated, one dumbbell held at shoulder height, opposite hand free or braced on your hip.",
    movement:
      "Press the dumbbell overhead until your arm is extended, then lower it under control back to shoulder height.",
    cues: [
      "Resist the urge to lean away from the working side — keep your torso upright and let your core control the imbalance.",
      "This unilateral load is a genuine core challenge as much as a shoulder one — a lighter weight with good posture beats a heavier one with a lean.",
    ],
  },
  "arnold-press": {
    setup:
      "Seated or standing, dumbbells at shoulder height, palms facing you, elbows in front of your body.",
    movement:
      "Press overhead while rotating your palms to face forward as you go, finishing with arms extended and palms out. Reverse the rotation as you lower.",
    cues: [
      "Keep the rotation smooth and continuous through the whole rep rather than rotating first and pressing second.",
      "Use a lighter weight than you'd use for a standard shoulder press while you learn the rotation timing.",
    ],
  },
  "lateral-raise": {
    setup:
      "Stand tall with a dumbbell in each hand at your sides, a soft bend in your elbows that you hold throughout.",
    movement:
      "Raise both arms out to the sides in a wide arc, leading with your elbows rather than your hands, until they reach roughly shoulder height, then lower back down under control.",
    cues: [
      "Use a weight you can lift with your shoulders alone — if you need to lean or rock to get it up, it's too heavy.",
      "Lead with your elbows, not your hands — think about pouring water from a jug at the top rather than lifting with your fingertips.",
      "Pause briefly at the top instead of using momentum to bounce into the next rep.",
    ],
    warning: {
      severity: "caution",
      text: "Keep it slow and controlled. Swinging the weight up using momentum from your hips or lower back is the most common way people cheat this exercise, and it takes the work away from your shoulders.",
    },
  },
  "front-raise": {
    setup: "Standing tall, dumbbells resting in front of your thighs, a soft bend in your elbows.",
    movement:
      "Raise both arms forward until they're roughly shoulder height, then lower back down under control.",
    cues: [
      "Raise to shoulder height, not higher — going further just shifts the work to your traps.",
      "Keep your torso still; swinging the weight up using your lower back is the easiest way to cheat this exercise.",
    ],
  },
  "rear-delt-fly": {
    setup:
      "Hinged forward at the hips with a flat back, dumbbells hanging below your shoulders, a soft bend in your elbows.",
    movement:
      "Raise both arms out to the sides, squeezing your shoulder blades together, then lower back down under control.",
    cues: [
      "Lead with your elbows rather than your hands, and keep the elbow bend fixed throughout.",
      "Keep your torso still and hinged — using your lower back to help swing the weight up is the most common way people cheat this one.",
    ],
  },
  "incline-rear-delt-fly": {
    setup:
      "Chest against an incline bench, dumbbells hanging straight down, a soft bend in your elbows.",
    movement:
      "Raise both arms out to the sides, squeezing your shoulder blades together, then lower back down under control.",
    cues: [
      "The bench removes the temptation to use your lower back — use that support to focus purely on your rear delts.",
      "Lead with your elbows and keep them slightly bent throughout, rather than raising with straight arms.",
    ],
  },
  "reverse-pec-deck": {
    setup:
      "Seated facing the pad, chest against the support, arms extended in front of you gripping the handles.",
    movement:
      "Pull your arms out to the sides, squeezing your shoulder blades together, then return under control to the stretch position.",
    cues: [
      "Keep a slight bend in your elbows throughout rather than locking them straight.",
      "Focus on squeezing your shoulder blades together at the back of the movement, not just moving your arms.",
    ],
  },
  shrug: {
    setup: "Standing tall, dumbbells at your sides, arms relaxed and straight.",
    movement:
      "Raise your shoulders straight up toward your ears, then lower back down under control.",
    cues: [
      "Move your shoulders straight up and down — rolling them forward or backward doesn't add benefit and can feel awkward on the joint.",
      "Pause briefly at the top rather than bouncing straight back down.",
    ],
  },
  "cable-lateral-raise": {
    setup:
      "Standing side-on to the low cable point, working arm across your body holding the handle.",
    movement:
      "Raise your arm out to the side until it's roughly shoulder height, then lower back down under control.",
    cues: [
      "The cable keeps tension on through the bottom of the range, unlike a dumbbell — use that by controlling the descent all the way down rather than letting it drop.",
      "Keep your torso upright rather than leaning away from the cable to help lift the weight.",
    ],
  },
  "machine-shoulder-press": {
    setup: "Seated with your back against the pad, handles at shoulder height.",
    movement:
      "Press the handles up until your arms are extended without locking out hard, then return under control to shoulder height.",
    cues: [
      "Adjust the seat so the handles start level with your shoulders, not above or below.",
      "Keep your back against the pad throughout rather than arching to finish the press.",
    ],
  },
  "upright-row": {
    setup:
      "Standing tall, bar held in front of your thighs with a grip roughly shoulder-width apart.",
    movement:
      "Pull the bar up toward your chin, leading with your elbows, until your upper arms are close to parallel with the floor, then lower under control.",
    cues: [
      "Stop around chest-to-chin height — pulling higher than that is where this exercise tends to irritate the shoulder for a lot of people.",
    ],
    warning: {
      severity: "caution",
      text: "A narrow grip combined with pulling too high is the main reason this exercise gets a reputation for shoulder discomfort. A wider grip and stopping at chest height is an easy adjustment if you feel any pinching.",
    },
  },

  // Arms
  "bicep-curl-db": {
    setup:
      "Standing tall, dumbbells at your sides, palms facing forward, elbows close to your body.",
    movement:
      "Curl the dumbbells up toward your shoulders, then lower under control back to a full stretch.",
    cues: [
      "Keep your elbows pinned at your sides — if they drift forward as you curl, your shoulders are taking over from your biceps.",
      "Lower all the way to a straight arm each rep rather than stopping short — that stretch position is where a lot of the growth stimulus comes from.",
    ],
    warning: {
      severity: "caution",
      text: "Swinging the weight up using your hips or lower back is the easiest way to cheat this exercise. If you need momentum to start the rep, the weight is too heavy for strict form.",
    },
  },
  "incline-db-curl": {
    setup:
      "Seated on an incline bench with your back supported, arms hanging straight down, palms facing forward.",
    movement:
      "Curl the dumbbells up toward your shoulders, then lower under control back to a full stretch.",
    cues: [
      "The incline pins your shoulders back, removing the ability to swing the weight — treat any momentum as a sign to drop the weight.",
      "Keep your upper arms still and slightly behind your torso throughout.",
    ],
  },
  "bicep-curl-bb": {
    setup:
      "Standing tall, bar held with an underhand grip roughly shoulder-width, arms extended at your thighs.",
    movement:
      "Curl the bar up toward your shoulders, then lower under control back to a full stretch.",
    cues: [
      "Keep your elbows at your sides throughout — letting them swing forward turns this into a front raise.",
      "Keep your torso still; leaning back to heave the bar up is the classic barbell curl cheat.",
    ],
  },
  "hammer-curl": {
    setup: "Standing tall, dumbbells at your sides, palms facing your body.",
    movement:
      "Curl the dumbbells up while keeping your palms facing in, then lower under control back to a full stretch.",
    cues: [
      "Keep your wrists neutral and your palms facing each other throughout — rotating toward a regular curl changes which muscles do the work.",
      "Keep your elbows at your sides rather than letting them drift forward as the weight gets heavier.",
    ],
  },
  "preacher-curl": {
    setup:
      "Chest and upper arms braced against the preacher pad, bar held at arm's length with an underhand grip.",
    movement:
      "Curl the bar up toward your shoulders, then lower under control back to a near-full stretch.",
    cues: [
      "The pad locks your upper arms in place, removing any swing — if you feel yourself lifting off the pad, the weight's too heavy.",
      "Don't fully lock your elbows out at the bottom of each rep; stop just short to keep tension on and protect the joint.",
    ],
  },
  "tricep-pushdown": {
    setup: "Standing facing the cable, bar at chest height, elbows tucked into your sides.",
    movement:
      "Push the bar down until your arms are fully extended, then let it return under control back to chest height.",
    cues: [
      "Keep your elbows pinned to your sides throughout — if they drift forward or out, your chest and shoulders start sharing the work.",
      "Control the return; don't let the weight stack yank your arms back up.",
    ],
  },
  "overhead-tri-ext": {
    setup:
      "Standing or seated, one dumbbell held overhead with both hands, elbows bent and pointing up.",
    movement:
      "Extend your arms until they're fully straight overhead, then lower under control back to a stretch behind your head.",
    cues: [
      "Keep your elbows pointing up and relatively still — they should be the hinge, not swinging forward and back.",
      "Keep your ribs down rather than arching your back to help finish the lockout.",
    ],
    warning: {
      severity: "caution",
      text: "This puts your elbows in a deep, loaded stretch behind your head — a good exercise to build up gradually in weight rather than loading heavy right away.",
    },
  },
  skullcrusher: {
    setup:
      "Lying on a bench, bar held above your forehead at arm's length, elbows bent and pointing toward the ceiling.",
    movement:
      "Lower the bar by bending your elbows until it's just above or behind your forehead, then extend back up until your arms are straight.",
    cues: [
      "Keep your upper arms vertical and still throughout — the movement happens at your elbow only.",
      "Lower toward your forehead or just past it, not straight down toward your neck.",
    ],
    warning: {
      severity: "caution",
      text: "Keep this one controlled and moderate on weight — a bar path that drifts back toward your face or neck is the specific risk with this exercise, more than with most other pressing movements.",
    },
  },
  "close-grip-bench": {
    setup:
      "Bar at chest height, hands just inside shoulder-width, elbows tucked closer to your body than a regular bench press.",
    movement:
      "Press the bar up until your arms are fully extended, keeping your elbows tucked, then lower it under control back to your chest.",
    cues: [
      "Keep your elbows tracking close to your body throughout — flaring them out shifts the work back toward your chest.",
    ],
    warning: {
      severity: "important",
      text: "Treat this like flat bench for safety — use the rack's pins or a spotter near your limit, especially since the narrower grip gives you less mechanical advantage if you get stuck partway up.",
    },
  },
  "wrist-curl": {
    setup:
      "Seated with your forearms resting on your thighs, bar held with an underhand grip, wrists just past your knees.",
    movement:
      "Curl your wrists up as far as they'll go, then lower under control to a full stretch.",
    cues: ["Keep your forearms still on your thighs — the movement is at your wrist only."],
  },
  "ez-bar-curl": {
    setup: "Standing tall, EZ-bar held at your thighs with the angled grip, elbows at your sides.",
    movement:
      "Curl the bar up toward your shoulders, then lower under control back to a full stretch.",
    cues: [
      "Keep your elbows at your sides throughout, same as a straight-bar curl — the angled grip changes wrist comfort, not technique.",
    ],
  },
  "cable-curl": {
    setup: "Standing facing the low cable point, bar held at your thighs, elbows at your sides.",
    movement:
      "Curl the bar up toward your shoulders, then let it return under control to a full stretch.",
    cues: [
      "The cable keeps tension on throughout, including the bottom — use that by controlling the descent rather than letting it snap back.",
    ],
  },
  "concentration-curl": {
    setup:
      "Seated, elbow braced against your inner thigh, arm extended toward the floor holding a dumbbell.",
    movement:
      "Curl the dumbbell up toward your shoulder, then lower under control back to a full stretch.",
    cues: [
      "Keep your elbow pinned against your thigh throughout — that's what isolates the movement to your bicep alone.",
      "Resist the urge to twist your torso to help finish the rep; a slower, lighter rep with strict form does more here than a heavier, twisted one.",
    ],
  },

  // Legs
  "back-squat": {
    setup:
      "Bar resting across your upper traps, not your neck. Feet shoulder-width apart or slightly wider, toes turned out a little. Unrack the bar and step back before setting your stance.",
    movement:
      "Sit down and back, keeping your chest up and weight spread through your whole foot. Go as deep as you can control well — most people aim for at least thighs-parallel — then drive back up through your heels and mid-foot.",
    cues: [
      "Track your knees in the same direction as your toes as you descend, rather than letting them cave inward.",
      "Keep weight through your whole foot, not rising onto your toes as you stand up.",
      "Brace and take a breath before you descend, hold it through the hardest part of the rep, then breathe out near the top.",
    ],
    warning: {
      severity: "important",
      text: "Set the safety bars/pins at a sensible height before you start, especially working near your limit alone — they turn a missed rep into a non-event instead of something you have to fight your way out of.",
    },
  },
  "front-squat": {
    setup:
      "Bar racked across the front of your shoulders, elbows lifted high to keep it from rolling forward, feet shoulder-width apart.",
    movement:
      "Sit down and back while keeping your torso more upright than a back squat, going as deep as you can control well, then drive back up through your whole foot.",
    cues: [
      "Keep your elbows up throughout the lift — if they drop, the bar loses its shelf and starts to roll off your shoulders.",
      "This more upright torso means your knees will travel further forward than in a back squat — that's normal for this variation, not a fault.",
    ],
    warning: {
      severity: "important",
      text: "Set the safety pins at a sensible height before working near your limit, same as a back squat. With the bar across the front of your shoulders, dropping it forward is generally the easier way to bail out if a rep fails, so it's worth knowing your rack's setup before you need it.",
    },
  },
  "goblet-squat": {
    setup:
      "Holding a dumbbell vertically at your chest with both hands, feet shoulder-width apart.",
    movement:
      "Sit down and back, keeping your chest up and elbows brushing the inside of your knees near the bottom, then stand back up.",
    cues: [
      "Let your elbows lightly brush your knees at the bottom — that's a natural depth cue this variation gives you that a barbell doesn't.",
      "Keep the dumbbell close to your chest throughout rather than letting it drift forward.",
    ],
  },
  "leg-press": {
    setup:
      "Seated with your back flat against the pad, feet shoulder-width apart on the platform, roughly centred.",
    movement:
      "Lower the platform by bending your knees toward your chest, keeping your lower back pressed against the pad. Press back up until your legs are extended, without locking your knees out hard at the top.",
    cues: [
      "Only go as deep as you can while keeping your lower back flat against the pad — if your hips lift or your back rounds, that's your depth limit.",
      "Keep your knees tracking in line with your toes rather than caving inward as you press.",
    ],
    warning: {
      severity: "important",
      text: "Don't chase extra depth by letting your lower back round or your hips lift off the pad — that shifts load onto your lower back and is a common way people tweak it on this machine.",
    },
  },
  "leg-extension": {
    setup:
      "Seated with your back against the pad, shins behind the lower pad, knees aligned with the machine's pivot point.",
    movement:
      "Extend your legs until they're straight without snapping into lockout, then lower under control back to the start.",
    cues: [
      "Control the lowering phase as much as the lift — letting the weight stack drop is where most of the benefit gets lost.",
      "Don't kick the last few degrees into lockout; ease into it instead.",
    ],
  },
  "leg-curl": {
    setup:
      "Lying face down, pad resting just above your heels, legs straight, hips flat against the bench.",
    movement:
      "Curl your heels toward your glutes, then lower under control back to a straight-leg start.",
    cues: [
      "Keep your hips pressed into the bench throughout — lifting them to help curl the weight takes tension off your hamstrings.",
    ],
  },
  lunge: {
    setup: "Standing tall, feet together, dumbbells at your sides if using added weight.",
    movement:
      "Step forward and lower until both knees are bent around 90°, back knee hovering just above the floor, then push off your front foot to step into the next lunge.",
    cues: [
      "Keep your torso upright rather than leaning forward over your front knee.",
      "Take a step long enough that your front knee stays roughly above your ankle at the bottom, not pushed out past your toes.",
    ],
  },
  "bulgarian-split-squat": {
    setup:
      "Rear foot elevated on a bench behind you, standing far enough forward on your front leg that your knee won't overshoot your toes at the bottom.",
    movement:
      "Lower straight down until your rear knee nearly touches the floor, then push through your front foot to stand back up.",
    cues: [
      "Keep most of your weight on your front leg — the rear foot is there for balance, not to push you up.",
      "If your front knee travels well past your toes at the bottom, try standing a little further forward from the bench.",
    ],
  },
  "hip-thrust": {
    setup:
      "Upper back braced against a bench, bar across your hips (padded), knees bent, feet flat on the floor roughly under your knees.",
    movement:
      "Drive your hips up until your body forms a straight line from shoulders to knees, squeezing your glutes at the top, then lower under control.",
    cues: [
      "Tuck your chin slightly and keep your ribs down at the top rather than arching your lower back to gain extra height.",
      "Drive through your heels rather than your toes.",
    ],
    warning: {
      severity: "caution",
      text: "Stop at a straight line through your hips at the top — pushing past that into a lower-back arch is a common way people try to add range here, but it moves the work off your glutes and onto your spine.",
    },
  },
  "db-hip-thrust": {
    setup:
      "Upper back braced against a bench, dumbbell held across your hips, knees bent, feet flat on the floor.",
    movement:
      "Drive your hips up until your body forms a straight line from shoulders to knees, squeezing your glutes at the top, then lower under control.",
    cues: [
      "Keep your ribs down and chin slightly tucked at the top rather than arching your back for extra height.",
    ],
  },
  "glute-bridge": {
    setup: "Lying on your back, knees bent, feet flat on the floor roughly hip-width apart.",
    movement:
      "Drive your hips up until your body forms a straight line from shoulders to knees, squeezing your glutes at the top, then lower under control.",
    cues: [
      "Push through your heels rather than your toes.",
      "Stop at a straight line — arching your lower back past that doesn't add benefit.",
    ],
  },
  "calf-raise": {
    setup:
      "Standing with the balls of your feet on the platform, heels hanging off the edge, knees straight but not locked.",
    movement:
      "Rise up onto your toes as high as you can, pause briefly, then lower your heels below the platform for a full stretch.",
    cues: [
      "Get a genuine stretch at the bottom — heels dropping just below the platform edge — rather than using a short, bouncy range.",
      "Pause at the top instead of bouncing straight back down; calves respond well to a brief hold.",
    ],
  },
  "seated-calf-raise": {
    setup:
      "Seated with the balls of your feet on the platform, pad resting across your lower thighs just above the knee.",
    movement:
      "Rise up onto your toes as high as you can, pause briefly, then lower for a full stretch.",
    cues: ["Get a full stretch at the bottom of each rep rather than a short, bouncy range."],
  },
  "hack-squat": {
    setup:
      "Back and shoulders against the pad, feet shoulder-width apart on the platform, roughly centred or slightly forward.",
    movement:
      "Squat down until your hips drop below your knees or as far as you can control well, then push back up.",
    cues: [
      "Keep your whole foot in contact with the platform — rising onto your toes shifts the load awkwardly onto your knees.",
      "Feet placed slightly higher/forward on the platform shift emphasis toward your glutes and hamstrings; lower/back shifts it toward your quads — adjust to taste.",
    ],
    warning: {
      severity: "important",
      text: "As with leg press, don't chase extra depth by letting your lower back round or lift off the pad — the machine's fixed path means your spine, not your hips, absorbs any range you force past what your hips can control.",
    },
  },
  "step-up": {
    setup:
      "Standing in front of a bench or box roughly knee height, dumbbells at your sides if using added weight.",
    movement:
      "Step up onto the box by driving through your leading foot until that leg is fully extended, then step back down under control.",
    cues: [
      "Push through your leading foot rather than pushing off your trailing foot — let it do as little work as possible.",
      "Choose a box height where your knee doesn't travel past a comfortable angle at the bottom of the step; too high a box often means the trailing leg starts helping more than intended.",
    ],
  },
  "hip-abduction": {
    setup:
      "Seated with your outer thighs against the pads, knees together, back against the support.",
    movement: "Push your legs apart against the resistance, then return under control.",
    cues: ["Control the return — letting the pads snap back together wastes half the exercise."],
  },
  "hip-adduction": {
    setup: "Seated with your inner thighs against the pads, legs apart, back against the support.",
    movement: "Squeeze your legs together against the resistance, then return under control.",
    cues: [
      "Control the return to the stretched position rather than letting the weight pull your legs apart quickly.",
    ],
  },
  "good-morning": {
    setup:
      "Bar across your upper back like a squat, standing tall with a soft bend in your knees that you hold fixed.",
    movement:
      "Hinge at your hips, pushing them back as your torso lowers toward parallel with the floor, then reverse by driving your hips forward to stand back up.",
    cues: [
      "Keep the bend in your knees fixed — this is a hip hinge, not a squat, so your knees shouldn't bend further as you lower.",
      "Only go as low as you can while keeping your back flat — for most people that's well short of parallel starting out.",
    ],
    warning: {
      severity: "safety",
      text: "This exercise has unforgiving leverage — even a modest-looking weight loads your lower back heavily once you're hinged forward. Start much lighter than you'd expect, and treat any rounding of your back as a hard stop for that set, not something to push through.",
    },
  },
  "kettlebell-swing": {
    setup:
      "Feet shoulder-width apart, kettlebell on the floor slightly in front of you, hinged forward gripping the handle.",
    movement:
      "Hike the kettlebell back between your legs, then drive your hips forward explosively to swing it up to shoulder height, letting it float briefly before it swings back down.",
    cues: [
      "This is a hip hinge, not a squat — your knees bend a little to absorb the backswing, but the power comes from snapping your hips forward, not from squatting the weight up.",
      "Let the kettlebell float at the top rather than muscling it higher with your arms and shoulders — your arms are just along for the ride.",
    ],
    warning: {
      severity: "important",
      text: "Squatting this movement instead of hinging is the most common mistake, and it's also the one that puts your lower back at risk — if you find yourself bending your knees deeply and standing up rather than snapping your hips, slow down and rebuild the hinge pattern with a lighter weight first.",
    },
  },
  "box-jump": {
    setup:
      "Standing in front of a box at a height you can clear comfortably, feet shoulder-width apart, knees slightly bent.",
    movement:
      "Swing your arms and jump up, landing on the box with both feet at the same time in a soft, absorbing landing, then step back down.",
    cues: [
      "Land quietly, letting your hips and knees bend to absorb the impact — a loud, stiff landing means you're not absorbing the force.",
      "Step down off the box rather than jumping back down; jumping down is where a lot of the unnecessary impact happens.",
    ],
    warning: {
      severity: "caution",
      text: "Choose a height you can clear with room to spare, not your absolute maximum. A missed step is the main way people get hurt on this exercise, and it gets more likely, not less, as the box gets higher.",
    },
  },
  burpee: {
    setup: "Standing tall, feet shoulder-width apart.",
    movement:
      "Drop into a squat, place your hands down and kick your feet back into a plank, do a push-up if including one, jump your feet back to your hands, then jump up explosively with your arms overhead.",
    cues: [
      "Keep your core braced as you kick back into the plank — letting your hips sag there is the most common breakdown point as you fatigue.",
      "Land softly from the jump, same as any other jumping exercise.",
    ],
  },

  // Core / holds
  plank: {
    setup:
      "Forearms on the floor with elbows under your shoulders, legs extended behind you on your toes, body in a straight line from head to heels.",
    movement:
      "Hold the position by bracing your core and squeezing your glutes, keeping your hips level with your shoulders and ankles. Breathe steadily rather than holding your breath.",
    cues: [
      "Keep your hips level with the rest of your body — the common mistake is letting them sag as you fatigue.",
      "Keep breathing normally — holding your breath doesn't make the brace stronger, it just tires you out faster.",
      "Think about pulling your elbows toward your toes without actually moving — that keeps your whole body engaged, not just your abs.",
    ],
  },
  "side-plank": {
    setup:
      "Forearm on the floor with your elbow under your shoulder, the side of your bottom foot on the floor, body in a straight line.",
    movement:
      "Hold the position by lifting your hips so your body stays in a straight line from head to feet, rather than sagging toward the floor.",
    cues: [
      "Keep your hips lifted and stacked — if the top hip rolls forward or back, you're losing the straight line down your side.",
      "Breathe steadily rather than holding your breath through the hold.",
    ],
  },
  "dead-hang": {
    setup: "Hanging from a bar with an overhand grip roughly shoulder-width, arms fully extended.",
    movement:
      "Hold the hang, keeping your shoulders slightly engaged and pulled down rather than letting them ride up around your ears.",
    cues: [
      "A slight engagement through your shoulders (sometimes called 'active hanging') is easier on the shoulder joint than hanging completely passive for long holds.",
      "Breathe normally throughout rather than holding your breath.",
    ],
  },
  "wall-sit": {
    setup:
      "Back flat against a wall, feet shoulder-width apart and out far enough that your knees bend to roughly 90°.",
    movement:
      "Hold the position, keeping your back flat against the wall and your knees tracking over your feet.",
    cues: [
      "Keep your knees roughly above your ankles, not pushed out past your toes.",
      "Breathe steadily — this is a long isometric hold, and holding your breath just makes it harder than it needs to be.",
    ],
  },
  "hollow-hold": {
    setup:
      "Lying on your back, arms extended overhead, legs extended, lower back pressed into the floor.",
    movement:
      "Lift your shoulders and legs a few inches off the floor, holding a slight curve through your torso while keeping your lower back pressed down.",
    cues: [
      "Keep your lower back pressed into the floor throughout — if it arches up off the ground, lower your legs or raise them higher until it presses back down.",
      "Start with knees bent and arms by your sides if the fully extended version arches your back; build up to that shape over time.",
    ],
  },
  "l-sit": {
    setup:
      "Supported on your hands (on the floor, parallettes, or a bar), arms straight, legs extended in front of you.",
    movement:
      "Hold your legs up parallel to the floor, keeping your arms locked and shoulders pressed down away from your ears.",
    cues: [
      "Press your shoulders down and lock your elbows — this is as much a shoulder and triceps hold as it is a core one.",
      "If holding both legs straight out is too difficult, tucking your knees to your chest is a genuine regression, not a lesser version of the exercise.",
    ],
  },
  crunch: {
    setup:
      "Lying on your back, knees bent, feet flat on the floor, hands lightly touching the sides of your head.",
    movement:
      "Curl your shoulders up off the floor by contracting your abs, then lower back down under control.",
    cues: [
      "Curl up, don't pull — your hands are there for light support only, not to yank your neck forward.",
      "You're aiming for a small range here — lifting your shoulder blades a few inches off the floor, not sitting all the way up.",
    ],
  },
  "sit-up": {
    setup:
      "Lying on your back, knees bent, feet anchored under something stable, hands lightly crossed over your chest or by your ears.",
    movement:
      "Sit all the way up until your torso is vertical, then lower back down under control.",
    cues: [
      "Lead with your chest rather than yanking your head and neck forward first.",
      "Control the way down as much as the way up — lying back quickly skips half the exercise.",
    ],
  },
  "hanging-leg-raise": {
    setup: "Hanging from a bar with an overhand grip, arms fully extended, legs straight down.",
    movement:
      "Raise your legs until they're roughly parallel to the floor, then lower back down under control.",
    cues: [
      "Curl your pelvis slightly under at the top rather than just swinging your legs up — that's what shifts the work onto your abs instead of your hip flexors.",
      "Control the descent; letting your legs swing back down builds momentum that makes the next rep less effective.",
      "Bending your knees is a genuine way to make this more manageable while you build up to straight legs, not a lesser version of the exercise.",
    ],
  },
  "russian-twist": {
    setup:
      "Seated, leaning back slightly with a flat back, feet on or off the floor, hands together in front of your chest.",
    movement:
      "Rotate your torso from side to side, tapping the floor beside your hip if using a weight.",
    cues: [
      "Rotate from your torso, not by swinging your arms across your body faster than your core is actually turning.",
      "Keep your back flat rather than rounding forward as you fatigue — a smaller, controlled range beats a bigger, rounded one.",
    ],
  },
  "ab-wheel": {
    setup:
      "Kneeling, hands on the wheel in front of you, arms extended, core braced before you move.",
    movement:
      "Roll the wheel forward as far as you can control while keeping a flat back, then pull back to the starting position using your abs, not your arms.",
    cues: [
      "Only roll out as far as you can stop yourself and reverse under control — a rollout you can't pull back from is a rollout that's going to strain your lower back.",
      "Keep your hips tucked slightly under throughout rather than letting your lower back sag toward the floor.",
    ],
    warning: {
      severity: "important",
      text: "If your lower back sags or arches as you roll out, that's your range limit for now, not something to push through — this exercise is deceptively hard on the lower back once your core stops controlling the position.",
    },
  },

  // Cardio
  treadmill: {
    setup:
      "Stand tall on the belt with relaxed shoulders, holding the rails only if you need to for balance, not to take weight off your legs.",
    movement:
      "Land midfoot underneath your hips rather than reaching out in front of you, keeping a steady, relaxed cadence.",
    cues: [
      "Holding the rails while running changes your posture and stride for the worse — if you feel you need them, the belt speed or incline is probably higher than is comfortable yet.",
      "Let your arms swing naturally at your sides rather than holding them stiff across your body.",
    ],
  },
  "rowing-machine": {
    setup: "Seated with feet strapped in, knees bent, arms extended toward the handle, back flat.",
    movement:
      "Drive with your legs first, then lean back slightly and finish by pulling the handle to your lower ribs. Reverse the order on the way back: arms out, then torso forward, then knees bend.",
    cues: [
      "The power comes from your legs first — if your arms are doing most of the pulling, you're skipping the biggest part of the stroke.",
      "Keep the sequence smooth: legs, then back, then arms on the drive; arms, then back, then legs on the return.",
    ],
  },
  "stationary-bike": {
    setup:
      "Seated with the seat height set so your knee has a slight bend at full pedal extension, hands on the bars.",
    movement:
      "Pedal at a steady cadence, keeping your hips level and still on the seat rather than rocking side to side.",
    cues: [
      "If your hips rock with each pedal stroke, the seat is usually too high — lower it slightly.",
      "Keep a light grip on the bars rather than bracing your whole upper body against them.",
    ],
  },
  elliptical: {
    setup: "Standing on the pedals with a slight bend in your knees, hands on the moving handles.",
    movement:
      "Drive the pedals in a smooth, steady stride, letting the handles move naturally with the opposite leg.",
    cues: [
      "Keep your weight centred over the pedals rather than leaning heavily on the handles — that takes work away from your legs.",
    ],
  },
  "stair-climber": {
    setup: "Standing tall with hands resting lightly on the rails, not gripping them for support.",
    movement:
      "Step at a steady pace, keeping your posture upright and pressing all the way through each step.",
    cues: [
      "Take full steps rather than small, rapid ones — a controlled full step works your legs harder than a fast shuffle.",
      "Resist leaning on the rails; using them to take your weight off your legs is the easiest way to make this exercise look harder than it actually is.",
    ],
  },
  "jump-rope": {
    setup:
      "Standing tall, rope behind your heels, elbows close to your body, wrists doing most of the rope's turning.",
    movement: "Jump just high enough to clear the rope, landing softly on the balls of your feet.",
    cues: [
      "Turn the rope from your wrists, not your whole arms — big arm circles waste energy and throw off your timing.",
      "Land softly with a slight bend in your knees; jumping flat-footed gets uncomfortable fast.",
    ],
  },
  "battle-ropes": {
    setup:
      "Standing with feet shoulder-width apart, knees slightly bent, one end of each rope in each hand.",
    movement:
      "Drive the ropes in alternating waves using your whole arm, keeping a stable, slightly bent-knee stance throughout.",
    cues: [
      "Keep your core braced and knees soft — most of the stability for this comes from your legs and trunk, not just your arms.",
      "Keep the waves even and controlled rather than rushing to make them as big as possible.",
    ],
  },
  "outdoor-run": {
    setup: "Stand tall with relaxed shoulders before you start.",
    movement:
      "Land midfoot underneath your hips, keeping a steady cadence and letting your arms swing naturally.",
    cues: [
      "A slightly quicker, shorter stride is usually easier on your joints than a long, reaching one.",
    ],
  },
  "outdoor-walk": {
    setup: "Stand tall with relaxed shoulders before you start.",
    movement: "Walk at a steady pace, letting your arms swing naturally at your sides.",
    cues: [
      "Keep your gaze forward rather than down at your feet — it's easier on your neck over a long walk.",
    ],
  },
  "outdoor-cycling": {
    setup:
      "Seated with hands on the bars, a slight bend in your elbows, saddle height set so your knee has a slight bend at full pedal extension.",
    movement:
      "Pedal at a steady cadence, keeping your hips level and your upper body relaxed rather than rigid.",
    cues: [
      "Keep a relaxed grip and slightly bent elbows to absorb bumps in the road rather than locking your arms out straight.",
    ],
  },
  swimming: {
    setup:
      "Streamlined position in the water, arms extended forward, body as flat and horizontal as you can manage.",
    movement:
      "Maintain a steady, controlled stroke rhythm, breathing in a consistent pattern rather than only when you feel out of breath.",
    cues: [
      "Keep your body as flat and horizontal as possible — a sinking hip or leg creates drag that makes everything else harder.",
    ],
  },
  "general-cardio": {
    setup: "Get into position for whichever activity you're logging.",
    movement:
      "Maintain a steady pace and controlled form throughout, adjusting intensity based on how the activity feels rather than chasing a fixed number.",
  },
  "rowing-intervals": {
    setup: "Seated with feet strapped in, knees bent, arms extended toward the handle, back flat.",
    movement:
      "Drive hard with your legs for the work interval, keeping the same leg-back-arms sequence as steady rowing, then ease right off during the rest interval rather than continuing to row lightly.",
    cues: [
      "Keep your form together even as fatigue builds during the hard intervals — a breakdown in technique under fatigue is where rowing tends to aggravate the lower back.",
    ],
  },
};

export function getExerciseFormNotes(exerciseId: string): ExerciseFormNote | undefined {
  return EXERCISE_FORM_NOTES[exerciseId];
}
