/* exported UTIL, time, timeEnd */
// eslint-disable-next-line no-redeclare
const UTIL = (function initUtil(){
  time();

  const A1_REGEX = /^\$?([A-Z]+)?\$?([0-9]+)(?::\$?([A-Z]+)?([0-9]+)?)?$/;
  // This intentionally has column before row because A1 does that :(
  function a1ToAbsolute(a1, columnAbsolute, rowAbsolute, endColumnAbsolute, endRowAbsolute) {
    const [,alphaColumn,row,endAlphaColumn,endRow] = A1_REGEX.exec(a1);
    let result = "";
    if (alphaColumn) {
      if (columnAbsolute !== false) result += "$";
      result += alphaColumn;
    }
    if (row) {
      if (rowAbsolute !== false) result += "$";
      result += row;
    }
    if (endAlphaColumn || endRow) {
      result += ":";
      if (endAlphaColumn) {
        if (endColumnAbsolute === true || (endColumnAbsolute !== false && columnAbsolute !== false)) result += "$";
        result += endAlphaColumn;
      }
      if (endRow) {
        if (endRowAbsolute === true || (endRowAbsolute !== false && rowAbsolute !== false)) result += "$";
        result += endRow;
      }
    }
    return result;
  }

  function a1ToRowAndColumn(a1) {
    const [,alphaColumn,row,endAlphaColumn,endRow] = A1_REGEX.exec(a1);
    const column = (alphaColumn) && _alphaColumnToNumber(alphaColumn);
    const endColumn = (endAlphaColumn)  && _alphaColumnToNumber(endAlphaColumn);
    return [row, column, endRow, endColumn];
  }

  function _alphaColumnToNumber(alphaColumn) {
    let column = 0;
    for (let i = alphaColumn.length-1; i >= 0; i--) {
      const alpha = alphaColumn.charAt(alphaColumn.length - i - 1);
      const num = parseInt(alpha,36)-9;
      const poweredNum = num * Math.pow(26, i);
      column += poweredNum;
    }
    return column;
  }

  function a1ToR1C1Absolute(a1) {
    const [row,column,endRow,endColumn] = a1ToRowAndColumn(a1);
    let result = "";
    if (row) result += "R" + row;
    if (column) result += "C" + column;
    if (endRow || endColumn) result += ":";
    if (endRow) result += "R" + endRow;
    if (endColumn) result += "C" + endColumn;
      
    return result;
  }


  // Without log aggregating, the _includeUnlabeled will just produce a secondary useless metric in log;
  //   including for symmetry
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


  timeEnd();
  return {
    a1ToAbsolute,
    a1ToR1C1Absolute,
    a1ToRowAndColumn,

    time,
    timeEnd,

    // resetCache,
  };
})();

// eslint-disable-next-line no-redeclare
const time = UTIL.time;
// eslint-disable-next-line no-redeclare
const timeEnd = UTIL.timeEnd;

// eslint-disable-next-line no-unused-vars
function testA1ToAbsolute() {
  console.log(UTIL.a1ToAbsolute("A1:B2"));
  console.log(UTIL.a1ToAbsolute("A1:B2",false));
  console.log(UTIL.a1ToAbsolute("A1:B2",true));
  console.log(UTIL.a1ToAbsolute("A1:B2",false,false));
  console.log(UTIL.a1ToAbsolute("A1:B2",false,true));
  console.log(UTIL.a1ToAbsolute("A1:B2",true,false));
  console.log(UTIL.a1ToAbsolute("A1:B2",true,true));
  console.log(UTIL.a1ToAbsolute("A1:B2",false,false,false));
  console.log(UTIL.a1ToAbsolute("A1:B2",false,false,true));
  console.log(UTIL.a1ToAbsolute("A1:B2",false,true,false));
  console.log(UTIL.a1ToAbsolute("A1:B2",false,true,true));
  console.log(UTIL.a1ToAbsolute("A1:B2",true,false,false));
  console.log(UTIL.a1ToAbsolute("A1:B2",true,false,true));
  console.log(UTIL.a1ToAbsolute("A1:B2",true,true,false));
  console.log(UTIL.a1ToAbsolute("A1:B2",true,true,true));
  console.log(UTIL.a1ToAbsolute("A1:B2",false,false,false,false));
  console.log(UTIL.a1ToAbsolute("A1:B2",false,false,false,true));
  console.log(UTIL.a1ToAbsolute("A1:B2",false,false,true,false));
  console.log(UTIL.a1ToAbsolute("A1:B2",false,false,true,true));
  console.log(UTIL.a1ToAbsolute("A1:B2",false,true,false,false));
  console.log(UTIL.a1ToAbsolute("A1:B2",false,true,false,true));
  console.log(UTIL.a1ToAbsolute("A1:B2",false,true,true,false));
  console.log(UTIL.a1ToAbsolute("A1:B2",false,true,true,true));
  console.log(UTIL.a1ToAbsolute("A1:B2",true,false,false,false));
  console.log(UTIL.a1ToAbsolute("A1:B2",true,false,false,true));
  console.log(UTIL.a1ToAbsolute("A1:B2",true,false,true,false));
  console.log(UTIL.a1ToAbsolute("A1:B2",true,false,true,true));
  console.log(UTIL.a1ToAbsolute("A1:B2",true,true,false,false));
  console.log(UTIL.a1ToAbsolute("A1:B2",true,true,false,true));
  console.log(UTIL.a1ToAbsolute("A1:B2",true,true,true,false));
  console.log(UTIL.a1ToAbsolute("A1:B2",true,true,true,true));
  
  
  
  console.log(UTIL.a1ToAbsolute("A1"));
  console.log(UTIL.a1ToAbsolute("A1",false));
  console.log(UTIL.a1ToAbsolute("A1",true));
  console.log(UTIL.a1ToAbsolute("A1",false,false));
  console.log(UTIL.a1ToAbsolute("A1",false,true));
  console.log(UTIL.a1ToAbsolute("A1",true,false));
  console.log(UTIL.a1ToAbsolute("A1",true,true));
  console.log(UTIL.a1ToAbsolute("A1",false,false,false));
  console.log(UTIL.a1ToAbsolute("A1",false,false,true));
  console.log(UTIL.a1ToAbsolute("A1",false,true,false));
}

