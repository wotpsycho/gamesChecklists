/* exported TOTALS */
// eslint-disable-next-line no-redeclare
const TOTALS = (function(){
// Save as Note to A1
  function updateTotals(checklist = ChecklistApp.getActiveChecklist()) {
    time();
    // static imports
    const {COLUMN,ROW} = ChecklistApp;
    const {STATUS} = AVAILABLE;
    const {CONCAT, A1, IF, GT, OR, ADD, COUNTIFS, VALUE, CHAR,EQ} = FORMULA;

    // TODO determine best way for reporting
    // if (columns.item === columns.check+1) return; // No type/category to break down
    // const counts = _countByType(sheet, columns.check+1);
    // Logger.log("counts",counts);
    // if (!counts) return;
    // const notes = [];
    // counts._order.forEach((type) => {
    //   notes.push(counts[type].checked + "/" + counts[type].total + " " + type);
    // });

    // notes.push(counts._total.checked + "/" + counts._total.total + " Total");
    const totalCell = checklist.getRange(ROW.TITLE,1);
    // totalCell.setNote(notes.join("\n"));
    const firstRow = checklist.firstDataRow;
    const itemColumn = checklist.toColumnIndex(COLUMN.ITEM);
    const statusColumn = checklist.toColumnIndex(COLUMN.STATUS);

    const total       = [A1(firstRow,itemColumn  ,null,itemColumn  ),VALUE("<>")                      ];
    const checked     = [A1(firstRow,statusColumn,null,statusColumn),VALUE(STATUS.CHECKED)   ,total];
    const missed      = [A1(firstRow,statusColumn,null,statusColumn),VALUE(STATUS.MISSED)    ,total];
    const prUsed      = [A1(firstRow,statusColumn,null,statusColumn),VALUE(STATUS.PR_USED)   ,total];
    const available   = [A1(firstRow,statusColumn,null,statusColumn),VALUE(STATUS.AVAILABLE) ,total];
    const unknown     = [A1(firstRow,statusColumn,null,statusColumn),VALUE(STATUS.UNKNOWN)   ,total];
    const unavailable = [A1(firstRow,statusColumn,null,statusColumn),VALUE(STATUS.PR_NOT_MET),total];


    
    const formula = CONCAT(
      IF(
        OR(
          GT(COUNTIFS(missed),VALUE.ZERO),
          GT(COUNTIFS(prUsed),VALUE.ZERO)
        ),
        CONCAT(
          VALUE("M: "), 
          COUNTIFS(missed), 
          IF(
            GT(COUNTIFS(prUsed),VALUE.ZERO),
            CONCAT(VALUE(" ("),COUNTIFS(prUsed),VALUE(")")),
            VALUE.EMPTYSTRING
          ),
          CHAR.NEWLINE
        ),
        VALUE.EMPTYSTRING
      ),
      VALUE("R: "),
      IF(
        EQ(
          ADD(COUNTIFS(available),COUNTIFS(unavailable)),
          VALUE.ZERO
        ),
        VALUE("★"),
        CONCAT(
          COUNTIFS(available),
          VALUE("|"),
          COUNTIFS(unavailable)
        )
      ), 
      IF(
        GT(COUNTIFS(unknown),VALUE.ZERO),
        CONCAT(VALUE(" ("),COUNTIFS(unknown),VALUE(")")),
        VALUE.EMPTYSTRING
      ),
      CHAR.NEWLINE,
      COUNTIFS(checked),
      VALUE("/"),
      COUNTIFS(total)
    );

    if (totalCell.getFormula() !== formula) {
      totalCell.setFormula(formula);
    }
    timeEnd();
  }

  return {
    updateTotals: updateTotals,
  };
})();

/* eslint-disable */
function testRange() {
  const range = SpreadsheetApp.getActiveSheet().getRange('A1');
  range.setFormula("IF(true,2)");
  return range.toString();
}