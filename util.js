/* exported time, timeEnd */
// eslint-disable-next-line no-redeclare
const {time,timeEnd} = (function(){
  
  function _timeHelper(callerName, timeFunction, labels) {
    callerName || (callerName = "[unknown]");
    const timeLabels = [];
    if (labels.length == 0 || labels[labels.length-1] === true) {
      labels.pop();
      timeLabels.push(callerName);
    }
    timeLabels.push(...labels.map(label => `${callerName} ${label}`));
    timeLabels.forEach(label => timeFunction.call(console, label));
  }
  function time(...labels) {
    const callerName = time.caller && time.caller.name;
    return _timeHelper(callerName, console.time, labels.flat());
  }

  function timeEnd(...labels) {
    const callerName = timeEnd.caller && timeEnd.caller.name;
    return _timeHelper(callerName, console.timeEnd, labels.flat());
  }
  return {time,timeEnd};
})();