/**
 * Short "how to do this" captions shown under the setup/movement images
 * in ExerciseFormViewer. Covers every exercise in the catalog — writing
 * these doesn't depend on having real photos, unlike the images
 * themselves (which get added exercise-by-exercise as they're generated;
 * see hasExerciseImages in exerciseImages.ts). A caption existing here
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
 */

export interface ExerciseFormNote {
  setup: string;
  movement: string;
}

export const EXERCISE_FORM_NOTES: Record<string, ExerciseFormNote> = {
  // Chest
  "bench-press": {
    setup: "Bar at chest height, hands just outside shoulder-width.",
    movement: "Press the bar up until your arms are fully extended.",
  },
  "incline-bench": {
    setup: "On an incline bench, bar lowered to the upper chest.",
    movement: "Press up and slightly back until your arms are extended.",
  },
  "db-bench-press": {
    setup: "Dumbbells at chest height, elbows bent about 90°.",
    movement: "Press both dumbbells up until your arms are extended.",
  },
  "incline-db-bench-press": {
    setup: "On an incline bench, dumbbells at upper-chest height.",
    movement: "Press the dumbbells up until your arms are extended.",
  },
  "floor-press": {
    setup: "Lying on the floor, bar lowered until your upper arms touch the ground.",
    movement: "Press the bar up until your arms are fully extended.",
  },
  "db-floor-press": {
    setup: "Lying on the floor, dumbbells lowered until your upper arms touch the ground.",
    movement: "Press both dumbbells up until your arms are extended.",
  },
  "chest-fly": {
    setup: "Lying on a bench, arms open to the sides with a slight bend in the elbows.",
    movement: "Bring the dumbbells together above your chest in an arcing motion.",
  },
  "db-pullover": {
    setup: "Lying on a bench, one dumbbell held with both hands, arms extended behind your head.",
    movement: "Pull the dumbbell up and over until it's above your chest.",
  },
  "cable-crossover": {
    setup: "Standing between the towers, arms out wide at shoulder height.",
    movement: "Bring your hands together in front of your chest in an arcing motion.",
  },
  "push-up": {
    setup: "Hands under shoulders, body in a straight line from head to heels.",
    movement: "Lower your chest to the floor, then press back up.",
  },
  dip: {
    setup: "Arms locked out on the dip bars, leaning slightly forward.",
    movement: "Lower until your upper arms are parallel to the floor, then press back up.",
  },
  "machine-chest-press": {
    setup: "Seated, handles at chest height, back against the pad.",
    movement: "Press the handles forward until your arms are extended.",
  },
  "decline-bench-press": {
    setup: "On a decline bench, bar lowered to the lower chest.",
    movement: "Press the bar up until your arms are fully extended.",
  },
  "pec-deck": {
    setup: "Seated, forearms against the pads at chest height.",
    movement: "Bring the pads together in front of your chest.",
  },

  // Back
  deadlift: {
    setup: "Bar over midfoot, hips back, flat back, grip just outside your legs.",
    movement: "Drive through the floor and stand fully upright, hips through at the top.",
  },
  "romanian-deadlift": {
    setup: "Standing tall, bar at hip height.",
    movement:
      "Hinge at the hips, lowering the bar along your legs until you feel a hamstring stretch.",
  },
  "single-leg-romanian-deadlift": {
    setup: "Standing on one leg, dumbbell in the opposite hand.",
    movement:
      "Hinge forward, extending your free leg back, until your torso is roughly parallel to the floor.",
  },
  "pull-up": {
    setup: "Hanging from the bar, arms fully extended, overhand grip.",
    movement: "Pull yourself up until your chin clears the bar.",
  },
  "chin-up": {
    setup: "Hanging from the bar, arms fully extended, underhand grip.",
    movement: "Pull yourself up until your chin clears the bar.",
  },
  "lat-pulldown": {
    setup: "Seated, bar held wide, arms extended overhead.",
    movement: "Pull the bar down to your upper chest.",
  },
  "seated-row": {
    setup: "Seated, arms extended toward the machine, slight lean forward.",
    movement: "Pull the handle to your torso, squeezing your shoulder blades together.",
  },
  "single-arm-cable-row": {
    setup: "Standing or half-kneeling, one arm extended toward the cable.",
    movement: "Pull the handle to your ribs, rotating slightly through your torso.",
  },
  "db-row": {
    setup: "One knee and hand on a bench, dumbbell hanging straight down.",
    movement: "Pull the dumbbell up to your hip, elbow close to your body.",
  },
  "chest-supported-db-row": {
    setup: "Chest against an incline bench, dumbbells hanging straight down.",
    movement: "Pull both dumbbells up to your torso.",
  },
  "barbell-row": {
    setup: "Hinged forward at the hips, bar hanging below your shoulders.",
    movement: "Pull the bar up to your lower ribs.",
  },
  "t-bar-row": {
    setup: "Hinged forward, gripping the handles, arms extended toward the weight.",
    movement: "Pull the handles up to your torso.",
  },
  "face-pull": {
    setup: "Cable at head height with a rope attachment, arms extended forward.",
    movement: "Pull the rope apart toward your face, leading with your elbows.",
  },
  "back-extension": {
    setup: "Hips on the pad, torso hinged forward toward the floor.",
    movement: "Raise your torso until your body forms a straight line.",
  },
  "sumo-deadlift": {
    setup: "Wide stance, hands inside your knees, hips low.",
    movement: "Drive through the floor and stand fully upright.",
  },
  "trap-bar-deadlift": {
    setup: "Standing inside the trap bar, hips back, flat back.",
    movement: "Drive through the floor and stand fully upright.",
  },
  "straight-arm-pulldown": {
    setup: "Standing, arms extended overhead holding the bar.",
    movement: "Pull the bar down to your thighs, keeping your arms straight.",
  },
  "assisted-pull-up": {
    setup: "Knees or feet on the platform, arms extended overhead.",
    movement: "Pull yourself up until your chin clears the bar.",
  },

  // Shoulders
  ohp: {
    setup: "Bar racked at shoulder height, hands just outside shoulder-width.",
    movement: "Press the bar overhead until your arms are extended.",
  },
  "db-shoulder-press": {
    setup: "Dumbbells at shoulder height, palms facing forward.",
    movement: "Press the dumbbells overhead until your arms are extended.",
  },
  "single-arm-shoulder-press": {
    setup: "One dumbbell held at shoulder height.",
    movement: "Press the dumbbell overhead until your arm is extended.",
  },
  "arnold-press": {
    setup: "Dumbbells at shoulder height, palms facing you.",
    movement: "Press overhead while rotating your palms to face forward.",
  },
  "lateral-raise": {
    setup: "Standing, dumbbells at your sides.",
    movement: "Raise both arms out to the sides until they're roughly shoulder height.",
  },
  "front-raise": {
    setup: "Standing, dumbbells in front of your thighs.",
    movement: "Raise both arms forward until they're roughly shoulder height.",
  },
  "rear-delt-fly": {
    setup: "Hinged forward at the hips, dumbbells hanging below your shoulders.",
    movement: "Raise both arms out to the sides, squeezing your shoulder blades together.",
  },
  "incline-rear-delt-fly": {
    setup: "Chest against an incline bench, dumbbells hanging straight down.",
    movement: "Raise both arms out to the sides.",
  },
  "reverse-pec-deck": {
    setup: "Seated facing the pad, arms extended in front of you.",
    movement: "Pull your arms out to the sides, squeezing your shoulder blades together.",
  },
  shrug: {
    setup: "Standing, dumbbells at your sides, arms relaxed.",
    movement: "Raise your shoulders straight up toward your ears.",
  },
  "cable-lateral-raise": {
    setup: "Standing side-on to the cable, working arm across your body.",
    movement: "Raise your arm out to the side until it's roughly shoulder height.",
  },
  "machine-shoulder-press": {
    setup: "Seated, handles at shoulder height.",
    movement: "Press the handles up until your arms are extended.",
  },
  "upright-row": {
    setup: "Standing, bar held in front of your thighs.",
    movement: "Pull the bar up toward your chin, leading with your elbows.",
  },

  // Arms
  "bicep-curl-db": {
    setup: "Standing, dumbbells at your sides, palms facing forward.",
    movement: "Curl the dumbbells up toward your shoulders.",
  },
  "incline-db-curl": {
    setup: "Seated on an incline bench, arms hanging straight down.",
    movement: "Curl the dumbbells up toward your shoulders.",
  },
  "bicep-curl-bb": {
    setup: "Standing, bar held with an underhand grip at your thighs.",
    movement: "Curl the bar up toward your shoulders.",
  },
  "hammer-curl": {
    setup: "Standing, dumbbells at your sides, palms facing your body.",
    movement: "Curl the dumbbells up, keeping your palms facing in.",
  },
  "preacher-curl": {
    setup: "Arms braced on the preacher pad, bar held at arm's length.",
    movement: "Curl the bar up toward your shoulders.",
  },
  "tricep-pushdown": {
    setup: "Standing, cable bar at chest height, elbows tucked in.",
    movement: "Push the bar down until your arms are fully extended.",
  },
  "overhead-tri-ext": {
    setup: "Dumbbell held overhead with both hands, elbows bent.",
    movement: "Extend your arms until they're fully straight overhead.",
  },
  skullcrusher: {
    setup: "Lying on a bench, bar held above your forehead, elbows bent.",
    movement: "Extend your arms until the bar is above your chest.",
  },
  "close-grip-bench": {
    setup: "Bar at chest height, hands just inside shoulder-width.",
    movement: "Press the bar up until your arms are fully extended.",
  },
  "wrist-curl": {
    setup: "Forearms resting on your thighs, bar held with palms up.",
    movement: "Curl your wrists up, then lower under control.",
  },
  "ez-bar-curl": {
    setup: "Standing, EZ-bar held at your thighs.",
    movement: "Curl the bar up toward your shoulders.",
  },
  "cable-curl": {
    setup: "Standing, cable bar held at your thighs.",
    movement: "Curl the bar up toward your shoulders.",
  },
  "concentration-curl": {
    setup: "Seated, elbow braced against your inner thigh, arm extended.",
    movement: "Curl the dumbbell up toward your shoulder.",
  },

  // Legs
  "back-squat": {
    setup: "Bar across your upper back, feet shoulder-width apart.",
    movement: "Squat down until your hips drop below your knees, then stand back up.",
  },
  "front-squat": {
    setup: "Bar racked across the front of your shoulders.",
    movement: "Squat down until your hips drop below your knees, then stand back up.",
  },
  "goblet-squat": {
    setup: "Holding a dumbbell at your chest, feet shoulder-width apart.",
    movement: "Squat down until your hips drop below your knees, then stand back up.",
  },
  "leg-press": {
    setup: "Seated, feet on the platform, shoulder-width apart.",
    movement: "Press the platform away until your legs are extended.",
  },
  "leg-extension": {
    setup: "Seated, shins behind the pad, knees bent.",
    movement: "Extend your legs until they're straight.",
  },
  "leg-curl": {
    setup: "Lying face down, pad behind your ankles, legs straight.",
    movement: "Curl your heels toward your glutes.",
  },
  lunge: {
    setup: "Standing tall, feet together.",
    movement: "Step forward and lower until both knees are bent around 90°.",
  },
  "bulgarian-split-squat": {
    setup: "Rear foot elevated on a bench, standing on your front leg.",
    movement: "Lower until your rear knee nearly touches the floor, then stand back up.",
  },
  "hip-thrust": {
    setup: "Upper back against a bench, bar across your hips, knees bent.",
    movement: "Drive your hips up until your body forms a straight line.",
  },
  "db-hip-thrust": {
    setup: "Upper back against a bench, dumbbell across your hips.",
    movement: "Drive your hips up until your body forms a straight line.",
  },
  "glute-bridge": {
    setup: "Lying on your back, knees bent, feet flat on the floor.",
    movement: "Drive your hips up until your body forms a straight line.",
  },
  "calf-raise": {
    setup: "Standing, balls of your feet on the platform, heels hanging off.",
    movement: "Rise up onto your toes as high as you can.",
  },
  "seated-calf-raise": {
    setup: "Seated, balls of your feet on the platform, pad across your thighs.",
    movement: "Rise up onto your toes as high as you can.",
  },
  "hack-squat": {
    setup: "Back against the pad, feet shoulder-width apart on the platform.",
    movement: "Squat down until your hips drop below your knees, then push back up.",
  },
  "step-up": {
    setup: "Standing in front of a bench or box, dumbbells at your sides.",
    movement: "Step up onto the box until your leg is fully extended.",
  },
  "hip-abduction": {
    setup: "Seated, outer thighs against the pads, knees together.",
    movement: "Push your legs apart against the resistance.",
  },
  "hip-adduction": {
    setup: "Seated, inner thighs against the pads, legs apart.",
    movement: "Squeeze your legs together against the resistance.",
  },
  "good-morning": {
    setup: "Bar across your upper back, standing tall.",
    movement: "Hinge at the hips, lowering your torso until it's roughly parallel to the floor.",
  },
  "kettlebell-swing": {
    setup: "Feet shoulder-width apart, kettlebell hanging in front of you.",
    movement: "Hinge and swing the kettlebell up to shoulder height using your hips.",
  },
  "box-jump": {
    setup: "Standing in front of a box, knees slightly bent.",
    movement: "Jump up and land on the box with both feet.",
  },
  burpee: {
    setup: "Standing tall, feet shoulder-width apart.",
    movement: "Drop into a push-up, then jump back up explosively.",
  },

  // Core / holds
  plank: {
    setup: "Forearms and toes on the floor, body in a straight line.",
    movement: "Hold the position, keeping your hips level and core braced.",
  },
  "side-plank": {
    setup: "Forearm and the side of one foot on the floor, body in a straight line.",
    movement: "Hold the position, keeping your hips lifted.",
  },
  "dead-hang": {
    setup: "Hanging from a bar, arms fully extended, shoulders relaxed.",
    movement: "Hold the hang, keeping your grip and shoulders engaged.",
  },
  "wall-sit": {
    setup: "Back against a wall, knees bent to roughly 90°.",
    movement: "Hold the position, keeping your back flat against the wall.",
  },
  "hollow-hold": {
    setup: "Lying on your back, arms and legs extended.",
    movement: "Lift your shoulders and legs off the floor, holding a slight curve.",
  },
  "l-sit": {
    setup: "Supported on your hands, legs extended in front of you.",
    movement: "Hold your legs up, parallel to the floor.",
  },
  crunch: {
    setup: "Lying on your back, knees bent, hands lightly behind your head.",
    movement: "Curl your shoulders up off the floor.",
  },
  "sit-up": {
    setup: "Lying on your back, knees bent, feet anchored.",
    movement: "Sit all the way up until your torso is vertical.",
  },
  "hanging-leg-raise": {
    setup: "Hanging from a bar, legs extended straight down.",
    movement: "Raise your legs until they're roughly parallel to the floor.",
  },
  "russian-twist": {
    setup: "Seated, leaning back slightly, feet off the floor.",
    movement: "Rotate your torso from side to side.",
  },
  "ab-wheel": {
    setup: "Kneeling, hands on the wheel in front of you.",
    movement: "Roll the wheel forward until your body is fully extended, then pull back.",
  },

  // Cardio
  treadmill: {
    setup: "Stand tall on the belt, holding the rails only if needed.",
    movement: "Land midfoot under your hips, keeping a steady cadence.",
  },
  "rowing-machine": {
    setup: "Seated, feet strapped in, knees bent, arms extended toward the handle.",
    movement: "Drive with your legs, then lean back and pull the handle to your chest.",
  },
  "stationary-bike": {
    setup: "Seated, seat height set so your knee has a slight bend at full extension.",
    movement: "Pedal at a steady cadence, keeping your hips level.",
  },
  elliptical: {
    setup: "Standing on the pedals, hands on the moving handles.",
    movement: "Drive the pedals in a smooth, steady stride.",
  },
  "stair-climber": {
    setup: "Standing tall, hands resting lightly on the rails.",
    movement: "Step at a steady pace, keeping your posture upright.",
  },
  "jump-rope": {
    setup: "Standing tall, rope behind your heels, elbows close to your body.",
    movement: "Jump just high enough to clear the rope, landing softly.",
  },
  "battle-ropes": {
    setup: "Standing, feet shoulder-width apart, one end of each rope in each hand.",
    movement: "Drive the ropes in alternating waves.",
  },
  "outdoor-run": {
    setup: "Stand tall, relaxed shoulders.",
    movement: "Land midfoot under your hips, keeping a steady cadence.",
  },
  "outdoor-walk": {
    setup: "Stand tall, relaxed shoulders.",
    movement: "Walk at a steady pace, letting your arms swing naturally.",
  },
  "outdoor-cycling": {
    setup: "Seated, hands on the bars, slight bend in your elbows.",
    movement: "Pedal at a steady cadence, keeping your hips level.",
  },
  swimming: {
    setup: "Streamlined position in the water, arms extended forward.",
    movement: "Maintain a steady, controlled stroke rhythm.",
  },
  "general-cardio": {
    setup: "Get into position for your chosen activity.",
    movement: "Maintain a steady pace and controlled form throughout.",
  },
  "rowing-intervals": {
    setup: "Seated, feet strapped in, knees bent, arms extended toward the handle.",
    movement: "Drive hard with your legs for the work interval, then ease off to recover.",
  },
};

export function getExerciseFormNotes(exerciseId: string): ExerciseFormNote | undefined {
  return EXERCISE_FORM_NOTES[exerciseId];
}
