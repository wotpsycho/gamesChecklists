/* exported CONFIG */
// eslint-disable-next-line no-redeclare
const CONFIG = (function(){

  const COLUMN_HEADERS = Object.freeze({
    check: "✓",
    type: "Type",
    item: "Item",
    preReq: "Pre-Reqs",
    missed: "Missable After",
    available: "Available",
    notes: "Notes",
  });

  const COLORS = Object.freeze({
    error: "#ff0000",
    notAvailable: "#fce5cd",
    missed: "#f4cccc",
    used: "#d5a6bd",
    disabled: "#d9d9d9",
    checkedBackground: "#f3f3f3",
    checkedText: "#666666",
    missable: "#990000",
  });

  const ROW_HEADERS = Object.freeze({
    quickFilter: "Filter",
    settings: "⚙",
    headers: "✓",
  });

  return Object.freeze({
    COLUMN_HEADERS,
    COLORS,
    ROW_HEADERS,
  });

})();

/* eslint-disable */
function testConfig() {
  time(); 
  try{
    const sheet = Checklist.getActiveSheet();
    const headerRowFinder = sheet.createDeveloperMetadataFinder()
      .withLocationType(SpreadsheetApp.DeveloperMetadataLocationType.ROW)
      .withKey("headerRow");
    const metaHeaderRowMeta = headerRowFinder.find();
    const metaHeaderRowRange = metaHeaderRowMeta[0].getLocation().getRow();
    return [metaHeaderRowRange.getRow(), metaHeaderRowRange.getColumn(), metaHeaderRowRange.getLastColumn()];
    const headerRange = sheet.getRange(`${headerRow}:${headerRow}`);
    const metadataRange = headerRange.getDeveloperMetadata()[0].getLocation().getRow();
    //headerRange.addDeveloperMetadata("headerRow");

    return [metadataRange.getRow(), metadataRange.getColumn(), metadataRange.getLastColumn()];
 
    const config = CONFIG.getConfig(Checklist.getActiveSheet());
    console.log(config);
    return config;
  } finally {
    timeEnd();
  }
}