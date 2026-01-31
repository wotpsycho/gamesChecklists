function _timeHelper(timeFunction: (label: string) => void, labels: unknown[]): void {
  const timeLabels = [];
  // If last argument is true, it was used as a flag in old code - just remove it
  if (labels.length > 0 && labels[labels.length - 1] === true) {
    labels.pop();
  }
  // Flatten and use labels directly (no caller name since .caller doesn't work in strict mode)
  const flatLabels = labels.flat().filter(label => label !== undefined && label !== null);
  flatLabels.forEach(label => timeFunction.call(console, String(label)));
}

export function time(...labels: unknown[]): void {
  return _timeHelper(console.time, labels);
}

export function timeEnd(...labels: unknown[]): void {
  return _timeHelper(console.timeEnd, labels);
}