export interface FixedStepFramePlan {
  acceptedDelta: number;
  droppedDelta: number;
  accumulator: number;
  interpolationAlpha: number;
  substepCount: number;
}

export function planFixedStepFrame(
  previousAccumulator: number,
  rawDelta: number,
  fixedStep: number,
  maxSubsteps: number
): FixedStepFramePlan {
  const safeAccumulator = Number.isFinite(previousAccumulator)
    ? Math.max(previousAccumulator, 0)
    : 0;
  const safeRawDelta = Number.isFinite(rawDelta) ? Math.max(rawDelta, 0) : 0;
  const safeFixedStep = Number.isFinite(fixedStep) && fixedStep > 0 ? fixedStep : 1 / 60;
  const safeMaxSubsteps = Number.isFinite(maxSubsteps)
    ? Math.max(1, Math.floor(maxSubsteps))
    : 1;
  const maxAcceptedDelta = safeFixedStep * safeMaxSubsteps;
  const acceptedDelta = Math.min(safeRawDelta, maxAcceptedDelta);
  let accumulator = safeAccumulator + acceptedDelta;
  const substepCount = Math.min(
    Math.floor((accumulator + Number.EPSILON) / safeFixedStep),
    safeMaxSubsteps
  );
  accumulator -= substepCount * safeFixedStep;

  let droppedDelta = safeRawDelta - acceptedDelta;
  if (accumulator >= safeFixedStep) {
    const overflow = Math.floor(accumulator / safeFixedStep) * safeFixedStep;
    accumulator -= overflow;
    droppedDelta += overflow;
  }

  accumulator = Math.max(0, accumulator);
  return {
    acceptedDelta,
    droppedDelta,
    accumulator,
    interpolationAlpha: accumulator / safeFixedStep,
    substepCount
  };
}
