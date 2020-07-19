var COLUMN_TITLES = {
  check: "✓",
  item: "Item",
  preReq: "Pre-Reqs",
  available: "Available",
  notes: "Notes",
  CONFIG: "CONFIG",
};

var COLORS = {
  error: "#ff0000",
  notAvailable: "#f4cccc",
  disabled: "#d9d9d9",
  checkedBackground: "#f3f3f3",
  checkedText: "#666666",
};

var ROW_TITLES = {
  quickFilter: "Filter",
  settings: "⚙",
};

function testConfig() {
  console.log(getConfig(SpreadsheetApp.getActiveSheet()));
}

var configCache;
function getConfig(sheet) {
  if (configCache) return Object.assign({},configCache);
  console.time("getConfig");
  
  var columns = getColumns(sheet);
  configCache = {
    static: {
      columnTitles: Object.assign({},COLUMN_TITLES),
      colors: Object.assign({},COLORS),
      rowTitles: Object.assign({}, ROW_TITLES),
    },
  };
  if (columns.CONFIG) {
    var configValues = _getColumnDataRange(sheet, columns.CONFIG).getValues();
    for (var i = 1; i <= configValues.length; i++) {
      var configValue = configValues[i-1][0];
//      Logger.log("[i,configValues,configValue]",[i,configValues,configValue])
      if (!configValue) break;
      var key, value;
      [key,value] = configValue.split("=");
      configCache[key] = value;
    }
  }
  
  console.timeEnd("getConfig");
  return Object.assign({},configCache);
}

function setConfig(sheet = SpreadsheetApp.getActiveSheet(), configType, configValue) {
  var columns = getColumns(sheet);
  var config = getConfig(sheet);
  if (config.hasOwnProperty(configType)) {
    if (configValue === null) delete configCache(configType);
    else configCache[configType] = configValue;
  } else {
    if (configValue !== null) configCache[configType] = configValue;
  }
  if (columns.CONFIG) {
    var configRange = _getColumnDataRange(sheet, columns.CONFIG);
    var configValues = configRange.getValues();
    var row;
    for (row = 1; row <= configValues.length; row++) {
      var existingConfigValue = configValues[row-1][0];
      var key,value;
      [key,value] = existingConfigValue.split("=");
      if (key == configType) break; // found cell with setting
      if (!existingConfigValue) break; // found first empty cell
    }
    configRange.getCell(row,1).setValue(configType + "=" + configValue);
  }
  return getConfig(sheet);
}