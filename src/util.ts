// eslint-disable-next-line @typescript-eslint/no-unused-vars
const {time,timeEnd} = (function(){
  
  function _timeHelper(callerName : string, timeFunction: (label:string)=>void, labels: unknown[]): void {
    callerName || (callerName = "[unknown]");
    const timeLabels = [];
    if (labels.length == 0 || labels[labels.length-1] === true) {
      labels.pop();
      timeLabels.push(callerName);
    }
    timeLabels.push(...labels.map(label => `${callerName} ${label}`));
    timeLabels.forEach(label => timeFunction.call(console, label));
  }
  function time(...labels: unknown[]): void {
    const callerName = time.caller && time.caller.name;
    return _timeHelper(callerName, console.time, labels.flat());
  }

  function timeEnd(...labels: unknown[]): void {
    const callerName = timeEnd.caller && timeEnd.caller.name;
    return _timeHelper(callerName, console.timeEnd, labels.flat());
  }
  return {time,timeEnd};
})();