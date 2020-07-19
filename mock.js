/**
 * Is in the .claspignore because this is only to prevent local errors
 * TODO find a way to get actual API
 */
SpreadsheetApp = {
    getActiveSheet () {return Sheet},
};

Sheet = {
    getRange () {return Range;},
};

Range = {
    getCell () {},

};