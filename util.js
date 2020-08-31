/* exported UTIL, time, timeEnd */
// eslint-disable-next-line no-redeclare
const UTIL = (function(){
  // Helpers to get various columns/rows/config
  let headerRowCache;
  function getHeaderRow(sheet = getSheet()) {
    if (headerRowCache) {
      return headerRowCache;
    }
    time();
    const filter = sheet.getFilter();
    if (filter) {
      headerRowCache = filter.getRange().getRow();
    } else if (sheet.getFrozenRows()) {
      headerRowCache = sheet.getFrozenRows();
    } else {
      for (let row = 1; row <= sheet.getLastRow(); row++) {
        if (sheet.getRange(row,1).getValue() == CONFIG.COLUMN_HEADERS.check) {
          headerRowCache = row;
          break;
        }
      }
    }
    timeEnd();
    return headerRowCache;
  }

  function getQuickFilterRow(sheet = getSheet()) {
    return  getRows(sheet).quickFilter;
  }

  // If array is passed, returns true if any are in range
  function isColumnInRange(column,range) {
    if (!column || !range) return false;
    if (Array.isArray(column)) {
      for (const col of column) {
        if (col >= range.getColumn() && col <= range.getLastColumn()) return true;
      }
      return false;
    }
    return column >= range.getColumn() && column <= range.getLastColumn();
  }

  function isRowInRange(row,range) {
    if (!row || !range) return false;
    return row >= range.getRow() && row <= range.getLastRow();
  }

  let columnsCache;
  function getColumns(sheet = getSheet(), _extraHeaders) {
    if (columnsCache && !_extraHeaders) {
      const columns =  Object.assign({},columnsCache);
      columns.byHeader = Object.assign({}, columns.byHeader);
      return columns;
    }
    time();

    const headerRow = getHeaderRow(sheet);
    if (!headerRow) return {};

    const headers = sheet.getRange(headerRow,1,1,sheet.getLastColumn() || 1).getValues()[0];
    const columns  = {
      byHeader: {
      }
    };
    for (let i = 0; i < headers.length; i++) {
      columns.byHeader[headers[i]] = i + 1;
    }
    Object.entries(CONFIG.COLUMN_HEADERS).forEach(([columnId, columnHeader]) => {
      const column = columns.byHeader[columnHeader];
      if (column >= 0) {
        columns[columnId] = columns.byHeader[columnHeader];
      }
    });
    // TODO remove and just use byHeader instead
    if (Array.isArray(_extraHeaders)) {
      _extraHeaders.forEach((header) =>  {
        const column = columns.byHeader[header];
        if (column >= 0) {
          columns[header] = column;
        }
      });
    }
    columnsCache = Object.assign({},columns);
    columnsCache.byHeader = Object.assign({}, columns.byHeader);
    timeEnd();
    if (_extraHeaders) {
      // until we remove the need for extraHeaders by only relying on byHeader, remove byHeader
      delete columns.byHeader;
    }
    return columns;
  }

  let rowsCache;
  function getRows(sheet = getSheet()) {
    if (rowsCache) return rowsCache;
    time();
    const headerRow = getHeaderRow(sheet);
    rowsCache = {
      header: headerRow,
    };
    if (headerRow > 1) {
      const rowHeaderValues = sheet.getRange(1,1,headerRow-1).getValues();
      Object.entries(CONFIG.ROW_HEADERS).forEach(([row, header]) => {
        for (let i = 0; i < rowHeaderValues.length; i++) {
          if (rowHeaderValues[i][0] === header) {
            rowsCache[row] = i+1;
          }
        }
      });
    }
    timeEnd();
    return rowsCache;
  }

  function getColumnRange(sheet = getSheet(), _columnIndex = undefined) {
    return getColumnRangeFromRow(sheet, _columnIndex, 1);
  }

  function getColumnDataRange(sheet = getSheet(), _columnIndex = undefined) {
    return getColumnRangeFromRow(sheet, _columnIndex, getHeaderRow(sheet)+1);
  }

  function getColumnDataRangeFromRange(sheet = getSheet(), columnIndex, range) {
    const firstDataRow = getHeaderRow(sheet) + 1;
    let firstRow = firstDataRow;
    let lastRow;
    if (range) {
      if (range.getLastRow() < firstDataRow) return; // Not in data range, no range
      if (range.getRow() > firstRow) firstRow = range.getRow();
      lastRow = range.getLastRow();
    }
    return getColumnRangeFromRow(sheet, columnIndex, firstRow, lastRow && (lastRow-firstRow+1));
  }

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

  let rangeCache = {};
  function getColumnRangeFromRow(sheet, columnIndex, rowIndex, _numRows) {
    const key = sheet.getName() + ":" + columnIndex + ":" + rowIndex + ":" + _numRows;
    if (rangeCache[key]) return rangeCache[key];
    time();
    rangeCache[key] = sheet.getRange(rowIndex, columnIndex, _numRows || (sheet.getLastRow()-rowIndex+1) || 1);
    timeEnd();
    return rangeCache[key];
  }

  function resetCache() {
    rangeCache = {};
    columnsCache = undefined;
    headerRowCache = undefined;
    rowsCache = undefined;
    SETTINGS.resetCache();
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

  let _sheet = SpreadsheetApp.getActiveSheet();
  function setSheet(sheet) {
    _sheet = sheet;
  }
  function getSheet() {
    return _sheet;
  }
  function clearSheet() {
    _sheet = SpreadsheetApp.getActiveSheet();
  }

  return {
    a1ToAbsolute,
    a1ToR1C1Absolute,
    a1ToRowAndColumn,

    getColumnDataRange,
    getColumnRange,
    getColumnDataRangeFromRange,
    getColumnRangeFromRow,
    getColumns,
    getHeaderRow,
    getQuickFilterRow,
    getRows,

    isColumnInRange,
    isRowInRange,

    time,
    timeEnd,

    setSheet,
    getSheet,
    clearSheet,

    resetCache,
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

