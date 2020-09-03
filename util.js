/* exported time, timeEnd */

// eslint-disable-next-line no-redeclare
function time(_extraLabel, _includeUnlabeled) {
  const functionName = time.caller && time.caller.name || "[unknown]";
  if (!_extraLabel || _includeUnlabeled) {
    console.time(functionName);
  }
  if (_extraLabel) {
    if (Array.isArray(_extraLabel)) {
      _extraLabel.forEach(extraLabel => console.time(functionName + " " + extraLabel));
    } else {
      console.time(functionName + " " + _extraLabel);
    }
  }
}

// eslint-disable-next-line no-redeclare
function timeEnd(_extraLabel, _includeUnlabeled) {
  const functionName = timeEnd.caller && timeEnd.caller.name || "[unknown]";
  if (!_extraLabel || _includeUnlabeled) {
    console.timeEnd(functionName);
  }
  if (_extraLabel) {
    if (Array.isArray(_extraLabel)) {
      _extraLabel.forEach(extraLabel => console.timeEnd(functionName + " " + extraLabel));
    } else {
      console.timeEnd(functionName + " " + _extraLabel);
    }
  }
}

