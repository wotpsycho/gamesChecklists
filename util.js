/* exported UTIL, time, timeEnd */
// eslint-disable-next-line no-redeclare
const UTIL = (function(){
  // Helpers to get various columns/rows/config
  var headerRowCache;
  function getHeaderRow(sheet = SpreadsheetApp.getActiveSheet()) {
    if (headerRowCache) {
      return headerRowCache;
    }
    time();
    var filter = sheet.getFilter();
    if (filter) {
      headerRowCache = filter.getRange().getRow();
    } else if (sheet.getFrozenRows()) {
      headerRowCache = sheet.getFrozenRows();
    } else {
      for (var row = 1; row <= sheet.getLastRow(); row++) {
        if (sheet.getRange(row,1).getValue() == CONFIG.COLUMN_HEADERS.check) {
          headerRowCache = row;
          break;
        }
      }
    }
    timeEnd();
    return headerRowCache;
  }

  function getQuickFilterRow(sheet = SpreadsheetApp.getActiveSheet()) {
    return  getRows(sheet).quickFilter;
  }

  function isColumnInRange(column,range) {
    if (!column || !range) return false;
    return column >= range.getColumn() && column <= range.getLastColumn();
  }

  function isRowInRange(row,range) {
    if (!row || !range) return false;
    return row >= range.getRow() && row <= range.getLastRow();
  }

  var columnsCache;
  function getColumns(sheet = SpreadsheetApp.getActiveSheet(), _extraHeaders) {
    if (columnsCache && !_extraHeaders) {
      const columns =  Object.assign({},columnsCache);
      columns.byHeader = Object.assign({}, columns.byHeader);
      return columns;
    }
    time();

    var headerRow = getHeaderRow(sheet);
    if (!headerRow) return {};

    var headers = sheet.getRange(headerRow,1,1,sheet.getLastColumn() || 1).getValues()[0];
    const columns  = {
      byHeader: {
      }
    };
    for (var i = 0; i < headers.length; i++) {
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

  var rowsCache;
  function getRows(sheet = SpreadsheetApp.getActiveSheet()) {
    if (rowsCache) return rowsCache;
    time();
    var headerRow = getHeaderRow(sheet);
    rowsCache = {
      header: headerRow,
    };
    if (headerRow > 1) {
      var rowHeaderValues = sheet.getRange(1,1,headerRow-1).getValues();
      for (var row in CONFIG.ROW_HEADERS) {
        for (var i = 0; i < rowHeaderValues.length; i++) {
          if (rowHeaderValues[i][0] === CONFIG.ROW_HEADERS[row]) {
            rowsCache[row] = i+1;
          }
        }
      }
    }
    timeEnd();
    return rowsCache;
  }

  function getColumnRange(sheet = SpreadsheetApp.getActiveSheet(), _columnIndex = undefined) {
    return getColumnRangeFromRow(sheet, _columnIndex, 1);
  }

  function getColumnDataRange(sheet = SpreadsheetApp.getActiveSheet(), _columnIndex = undefined) {
    return getColumnRangeFromRow(sheet, _columnIndex, getHeaderRow(sheet)+1);
  }

  const A1_REGEX = /^\$?([A-Z]+)?\$?([0-9]+)(?::\$?([A-Z]+)?([0-9]+)?)?$/;
  // This intentionally has column before row because A1 does that :(
  function a1ToAbsolute(a1, columnAbsolute, rowAbsolute, endColumnAbsolute, endRowAbsolute) {
    var [,alphaColumn,row,endAlphaColumn,endRow] = A1_REGEX.exec(a1);
    var result = "";
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
    var [,alphaColumn,row,endAlphaColumn,endRow] = A1_REGEX.exec(a1);
    var column;
    if (alphaColumn) {
      column = _alphaColumnToNumber(alphaColumn);
    }
    var endColumn;
    if (endAlphaColumn) {
      endAlphaColumn = _alphaColumnToNumber(endAlphaColumn);
    }
    return [row, column, endRow, endColumn];
  }

  function _alphaColumnToNumber(alphaColumn) {
    var column = 0;
    for (var i = alphaColumn.length-1; i >= 0; i--) {
      var alpha = alphaColumn.charAt(alphaColumn.length - i - 1);
      var num = parseInt(alpha,36)-9;
      var poweredNum = num * Math.pow(26, i);
      column += poweredNum;
    }
    return column;
  }

  function a1ToR1C1Absolute(a1) {
    var [row,column,endRow,endColumn] = a1ToRowAndColumn(a1);
    var result = "";
    if (row) result += "R" + row;
    if (column) result += "C" + column;
    if (endRow || endColumn) result += ":";
    if (endRow) result += "R" + endRow;
    if (endColumn) result += "C" + endColumn;
      
    return result;
  }

  var rangeCache = {};
  function getColumnRangeFromRow(sheet, columnIndex, rowIndex, _numRows) {
    var key = sheet.getName() + ":" + columnIndex + ":" + rowIndex + ":" + _numRows;
    if (rangeCache[key]) return rangeCache[key];
    time();
    rangeCache[key] = sheet.getRange(rowIndex, columnIndex, _numRows || (sheet.getLastRow()-rowIndex+1) || 1);
    timeEnd();
    return rangeCache[key];
  }

  function _resetCache() {
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
    var functionName = time.caller.name;
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
    var functionName = timeEnd.caller.name;
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

  return {
    a1ToAbsolute: a1ToAbsolute,
    a1ToR1C1Absolute: a1ToR1C1Absolute,
    a1ToRowAndColumn: a1ToRowAndColumn,

    getColumnDataRange: getColumnDataRange,
    getColumnRange: getColumnRange,
    getColumnRangeFromRow: getColumnRangeFromRow,
    getColumns: getColumns,
    getHeaderRow: getHeaderRow,
    getQuickFilterRow: getQuickFilterRow,
    getRows: getRows,

    isColumnInRange: isColumnInRange,
    isRowInRange: isRowInRange,

    time: time,
    timeEnd: timeEnd,

    resetCache: _resetCache,
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

