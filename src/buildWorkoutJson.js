// ─────────────────────────────────────────────────────────────
//  buildWorkoutJson.js
//  buildWorkoutJson(name, steps) → Garmin workout JSON object
//
//  Converts the ParsedStep AST from parseWorkoutText() into a
//  complete Garmin Connect workout JSON ready for import.
//
//  Uses the same step-builder logic proven in the existing
//  workout export system (RepeatGroupDTO, conditionTypeId:2 for
//  time, metres for endConditionValue, weightValue:-1.0 etc.)
// ─────────────────────────────────────────────────────────────

import { paceZone, fmtPaceStr } from "./parseWorkout.js";

// ── Step ID counter (module-level, resets per module load) ───
let _id = 200000000;
const nextId = () => ++_id;

// ── Shared helpers ────────────────────────────────────────────
const KM_UNIT = { unitId:2, unitKey:"kilometer", factor:100000.0 };

function paceToMs(secPerKm) {
  if (!secPerKm || secPerKm <= 0) return null;
  return Math.round((1000 / secPerKm) * 1e7) / 1e7;
}

function stepType(key) {
  const map = { warmup:1, cooldown:2, interval:3, recovery:4, rest:5 };
  return { stepTypeId: map[key] ?? 3, stepTypeKey: key, displayOrder: map[key] ?? 3 };
}

function baseFields() {
  return {
    childStepId: null, endConditionCompare: null,
    targetValueUnit: null, zoneNumber: null,
    secondaryTargetType: null, secondaryTargetValueOne: null,
    secondaryTargetValueTwo: null, secondaryTargetValueUnit: null, secondaryZoneNumber: null,
    endConditionZone: null,
    strokeType: { strokeTypeId:0, strokeTypeKey:null, displayOrder:0 },
    equipmentType: { equipmentTypeId:0, equipmentTypeKey:null, displayOrder:0 },
    category: null, exerciseName: null, workoutProvider: null,
    providerExerciseSourceId: null,
    weightValue: -1.0,
    weightUnit: { unitId:8, unitKey:"kilogram", factor:1000.0 },
  };
}

function paceTarget(paceSecKm) {
  if (!paceSecKm) {
    return {
      targetType: { workoutTargetTypeId:1, workoutTargetTypeKey:"no.target", displayOrder:1 },
      targetValueOne: null, targetValueTwo: null,
    };
  }
  const [slow, fast] = paceZone(paceSecKm);
  return {
    targetType: { workoutTargetTypeId:6, workoutTargetTypeKey:"pace.zone", displayOrder:6 },
    targetValueOne: paceToMs(slow),
    targetValueTwo: paceToMs(fast),
  };
}

// ── Note builder ──────────────────────────────────────────────
/**
 * Build a human coaching note for a step — shown on the watch screen
 * as the step description. Keeps to ~40 chars so it fits the display.
 *
 * Priority: user-supplied desc → generated note from kind + effort.
 */
function buildNote(parsedStep, repContext = null) {
  const { kind, distM, durationSec, paceSecKm, paceLabel, effort, desc } = parsedStep;

  // Helper: format distance for display
  const distStr = distM != null
    ? (distM >= 1000 ? `${distM / 1000}km` : `${distM}m`)
    : null;

  // Helper: format duration for display
  function durStr(sec) {
    if (!sec) return null;
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return m > 0 ? (s > 0 ? `${m}min ${s}s` : `${m}min`) : `${s}s`;
  }

  const pace = paceLabel ? `@${paceLabel}/km` : null;

  // Repeat header note — tells the runner the set coming up
  if (kind === "repeat") return null; // RepeatGroupDTO has no description field

  switch (kind) {
    case "warmup":
      return distStr && pace
        ? `${distStr} warm up ${pace} — settle in`
        : distStr
          ? `${distStr} warm up — easy, settle in`
          : "Warm up — easy effort to start";

    case "cooldown":
      return distStr && pace
        ? `${distStr} cool down ${pace} — shake it out`
        : distStr
          ? `${distStr} cool down — easy, let it go`
          : "Cool down — easy, you're done";

    case "rest":
    case "recovery": {
      const howLong = durationSec ? durStr(durationSec) : distStr ? distStr : null;
      if (effort === "easy" || effort === "float") {
        return howLong
          ? `${howLong} easy — float, keep moving`
          : pace
            ? `Easy ${pace} — float, stay loose`
            : "Easy — float, stay loose";
      }
      if (durationSec) {
        return repContext
          ? `${durStr(durationSec)} rest — shake out, next rep coming`
          : `${durStr(durationSec)} standing rest — recover fully`;
      }
      if (distStr) {
        return pace
          ? `${distStr} recovery ${pace}`
          : `${distStr} easy recovery jog`;
      }
      return "Recovery — keep moving, breathe";
    }

    case "interval": {
      // Effort keywords give cues
      const effortCue = {
        hard:  "push hard — controlled aggression",
        fast:  "fast — turn the legs over",
        float: "float — quick but relaxed",
        easy:  "easy effort",
      }[effort] || null;

      if (distStr && pace) {
        return effortCue
          ? `${distStr} ${pace} — ${effortCue}`
          : `${distStr} ${pace}`;
      }
      if (distStr && effortCue) return `${distStr} — ${effortCue}`;
      if (distStr) return `${distStr} interval`;
      if (durationSec && pace) {
        return effortCue
          ? `${durStr(durationSec)} ${pace} — ${effortCue}`
          : `${durStr(durationSec)} ${pace}`;
      }
      if (durationSec && effortCue) return `${durStr(durationSec)} — ${effortCue}`;
      if (durationSec) return `${durStr(durationSec)} hard`;
      return effortCue || "Interval — go";
    }

    default:
      return desc || null;
  }
}

// Distance step — endConditionValue in metres, displayed as km
function distStep(order, kind, distM, paceSecKm, desc) {
  // warmup/cooldown use lap button; all others use distance
  const isLap = kind === "warmup" || kind === "cooldown";
  return {
    type: "ExecutableStepDTO",
    stepId: nextId(),
    stepOrder: order,
    stepType: stepType(kind),
    description: desc || null,
    endCondition: isLap
      ? { conditionTypeId:1, conditionTypeKey:"lap.button", displayOrder:1, displayable:true }
      : { conditionTypeId:3, conditionTypeKey:"distance", displayOrder:3, displayable:true },
    endConditionValue: isLap ? 0.0 : distM,
    preferredEndConditionUnit: isLap ? null : KM_UNIT,
    ...paceTarget(paceSecKm),
    ...baseFields(),
  };
}

// Time step — endConditionValue in seconds
function timeStep(order, kind, durationSec, paceSecKm, desc) {
  return {
    type: "ExecutableStepDTO",
    stepId: nextId(),
    stepOrder: order,
    stepType: stepType(kind),
    description: desc || null,
    endCondition: { conditionTypeId:2, conditionTypeKey:"time", displayOrder:2, displayable:true },
    endConditionValue: durationSec,
    preferredEndConditionUnit: null,
    ...paceTarget(paceSecKm),
    ...baseFields(),
  };
}

// Repeat block — wraps children, inner steps use global step ordering
function repeatBlock(order, reps, children) {
  const numbered = children.map((s, i) => ({ ...s, stepOrder: order + i + 1 }));
  return {
    type: "RepeatGroupDTO",
    stepId: nextId(),
    stepOrder: order,
    stepType: { stepTypeId:6, stepTypeKey:"repeat", displayOrder:6 },
    childStepId: 1,
    description: null,
    numberOfIterations: reps,
    smartRepeat: false,
    skipLastRestStep: null,
    endCondition: { conditionTypeId:7, conditionTypeKey:"iterations", displayOrder:7, displayable:false },
    endConditionValue: reps,
    preferredEndConditionUnit: null,
    endConditionCompare: null,
    targetType: { workoutTargetTypeId:1, workoutTargetTypeKey:"no.target", displayOrder:1 },
    targetValueOne: null, targetValueTwo: null, targetValueUnit: null, zoneNumber: null,
    secondaryTargetType: null, secondaryTargetValueOne: null,
    secondaryTargetValueTwo: null, secondaryTargetValueUnit: null, secondaryZoneNumber: null,
    endConditionZone: null,
    strokeType: { strokeTypeId:0, strokeTypeKey:null, displayOrder:0 },
    equipmentType: { equipmentTypeId:0, equipmentTypeKey:null, displayOrder:0 },
    category: null, exerciseName: null, workoutProvider: null,
    providerExerciseSourceId: null,
    weightValue: -1.0,
    weightUnit: { unitId:8, unitKey:"kilogram", factor:1000.0 },
    workoutSteps: numbered,
  };
}

// ── AST → Garmin steps ────────────────────────────────────────

function buildStep(parsedStep, order = 0, repContext = false) {
  const { kind, distM, durationSec, paceSecKm } = parsedStep;
  const note = buildNote(parsedStep, repContext);

  if (kind === "repeat") {
    const childSteps = parsedStep.children.map((c, i) => buildStep(c, i + 1, true));
    return repeatBlock(order, parsedStep.reps, childSteps);
  }

  if (durationSec != null) {
    return timeStep(order, kind, durationSec, paceSecKm, note);
  }

  if (distM != null) {
    return distStep(order, kind, distM, paceSecKm, note);
  }

  // Fallback — unknown step, use a 1km interval
  return distStep(order, "interval", 1000, paceSecKm, note || "Interval");
}

// ── Totals calculation ────────────────────────────────────────

function calcTotals(garminSteps) {
  let distM = 0;
  let secs  = 0;

  for (const s of garminSteps) {
    if (s.type === "RepeatGroupDTO") {
      const reps = s.numberOfIterations || 1;
      for (const cs of s.workoutSteps) {
        if (cs.endCondition?.conditionTypeKey === "distance") distM += (cs.endConditionValue || 0) * reps;
        if (cs.endCondition?.conditionTypeKey === "time")     secs  += (cs.endConditionValue || 0) * reps;
      }
    } else {
      if (s.endCondition?.conditionTypeKey === "distance") distM += s.endConditionValue || 0;
      if (s.endCondition?.conditionTypeKey === "time")     secs  += s.endConditionValue || 0;
    }
  }

  return { distM: Math.round(distM), secs: Math.round(secs) };
}

// ── Main builder ──────────────────────────────────────────────

/**
 * Convert a parsed workout AST into a full Garmin Connect JSON object.
 *
 * @param {string} name   - Workout name
 * @param {ParsedStep[]} steps - From parseWorkoutText()
 * @returns {object} Garmin workout JSON
 */
export function buildWorkoutJson(name, steps) {
  // Reset ID counter so exports are deterministic per call
  _id = 200000000;

  // Build raw steps
  let garminSteps = steps.map((s, i) => buildStep(s, i + 1));

  // Number top-level steps 1, 2, 3...
  garminSteps = garminSteps.map((s, i) => ({ ...s, stepOrder: i + 1 }));

  // Renumber inner steps of each repeat using their parent's stepOrder as offset
  garminSteps = garminSteps.map(s => {
    if (s.type !== "RepeatGroupDTO") return s;
    return {
      ...s,
      workoutSteps: s.workoutSteps.map((cs, ci) => ({
        ...cs,
        stepOrder: s.stepOrder + ci + 1,
      })),
    };
  });

  const { distM, secs } = calcTotals(garminSteps);
  const now = new Date().toISOString().replace(/\.\d{3}Z$/, ".0");

  return {
    workoutId:   null,
    ownerId:     null,
    workoutName: name,
    description: name,
    updatedDate: now,
    createdDate: now,
    sportType: { sportTypeId:1, sportTypeKey:"running", displayOrder:1 },
    subSportType: null,
    trainingPlanId: null,
    author: null,
    sharedWithUsers: null,
    estimatedDurationInSecs: secs || null,
    estimatedDistanceInMeters: distM || null,
    workoutSegments: [{
      segmentOrder: 1,
      sportType: { sportTypeId:1, sportTypeKey:"running", displayOrder:1 },
      poolLengthUnit: null, poolLength: null, avgTrainingSpeed: null,
      estimatedDurationInSecs: null, estimatedDistanceInMeters: null,
      estimatedDistanceUnit: null, estimateType: null, description: null,
      workoutSteps: garminSteps,
    }],
    poolLength: null, poolLengthUnit: null, locale: null,
    workoutProvider: null, workoutSourceId: null, uploadTimestamp: null,
    atpPlanId: null, consumer: null, consumerName: null,
    consumerImageURL: null, consumerWebsiteURL: null,
    workoutNameI18nKey: null, descriptionI18nKey: null,
    avgTrainingSpeed: (distM && secs) ? distM / secs : null,
    estimateType: secs ? "TIME_ESTIMATED" : null,
    estimatedDistanceUnit: distM ? { unitId:1, unitKey:"meter", factor:100.0 } : null,
    workoutThumbnailUrl: null,
    isSessionTransitionEnabled: null,
    shared: false,
  };
}
