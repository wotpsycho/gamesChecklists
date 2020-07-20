/* exported CONFIG */
// eslint-disable-next-line no-redeclare
const CONFIG = (function(){

  // eslint-disable-next-line no-redeclare
  const COLUMN_HEADERS = {
    check: "✓",
    item: "Item",
    preReq: "Pre-Reqs",
    available: "Available",
    notes: "Notes",
    CONFIG: "CONFIG",
  };

  const COLORS = {
    error: "#ff0000",
    notAvailable: "#f4cccc",
    disabled: "#d9d9d9",
    checkedBackground: "#f3f3f3",
    checkedText: "#666666",
  };

  const ROW_HEADERS = {
    quickFilter: "Filter",
    settings: "⚙",
    headers: "✓",
  };

  let configCache;
  function getConfig(sheet) {
    if (configCache) {
      const config = Object.assign({},configCache);
      config.static = Object.assign({},config);
      return config;
    }
    time();
    
    const columns = UTIL.getColumns(sheet);
    const config = {
      static: {
        columnTitles: Object.assign({},COLUMN_HEADERS),
        colors: Object.assign({},COLORS),
        rowTitles: Object.assign({}, ROW_HEADERS),
      },
    };
    if (columns.CONFIG) {
      const configValues = UTIL.getColumnDataRange(sheet, columns.CONFIG).getValues().map((configRow) => configRow[0]);
      configValues.forEach((configValue) => {
        if (!configValue) return;
        const [key,value] = configValue.split("=");
        config[key] = value;
      });
    }
    configCache = Object.assign({}, config);
    configCache.static = Object.assign({}, config.static);
    timeEnd();

    return config;
  }
  function setConfig(sheet = SpreadsheetApp.getActiveSheet(), configType, configValue) {
    const columns = UTIL.getColumns(sheet);
    const config = getConfig(sheet);
    if (Object.prototype.hasOwnProperty.call(config, configType)) {
      if (configValue === null) delete configCache(configType);
      else configCache[configType] = configValue;
    } else {
      if (configValue !== null) configCache[configType] = configValue;
    }
    if (columns.CONFIG) {
      const configRange = UTIL.getColumnDataRange(sheet, columns.CONFIG);
      const configValues = configRange.getValues();
      let row;
      for (row = 1; row <= configValues.length; row++) {
        const existingConfigValue = configValues[row-1][0];
        let [key] = existingConfigValue.split("=");
        if (key == configType) break; // found cell with setting
        if (!existingConfigValue) break; // found first empty cell
      }
      configRange.getCell(row,1).setValue(configType + "=" + configValue);
    }
    return getConfig(sheet);
  }

  return {
    COLUMN_HEADERS: COLUMN_HEADERS,
    COLORS: COLORS,
    ROW_HEADERS: ROW_HEADERS,

    getConfig: getConfig,
    setConfig: setConfig,
  };

})();


// eslint-disable-next-line no-unused-vars
function testConfig() {
  console.log(CONFIG.getConfig(SpreadsheetApp.getActiveSheet()));
}