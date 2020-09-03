/* exported TOTALS */
// eslint-disable-next-line no-redeclare
const TOTALS = (function(){
// Save as Note to A1
  function updateTotals(sheet) {
    time();
    const COLUMN = Checklist.COLUMN;
    const checklist = Checklist.fromSheet(sheet);
    // console.log(columns);
    // console.log(rows);
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
    const totalCell = checklist.getRange("A1");
    // totalCell.setNote(notes.join("\n"));
    const firstRow = checklist.firstDataRow;
    const itemColumn = checklist.toColumnIndex(COLUMN.ITEM);
    const checkColumn = checklist.toColumnIndex(COLUMN.CHECK);
    const statusColumn = checklist.toColumnIndex(COLUMN.STATUS);

    const total       = `R${firstRow}C${itemColumn}:C${itemColumn}, "<>"`;
    const checked     = `R${firstRow}C${checkColumn}:C${checkColumn},TRUE,${total}`;
    const missed      = `R${firstRow}C${statusColumn}:C${statusColumn},"MISSED",${total}`;
    const prUsed      = `R${firstRow}C${statusColumn}:C${statusColumn},"PR_USED",${total}`;
    const available   = `R${firstRow}C${statusColumn}:C${statusColumn},"TRUE",${total}`;
    const unknown     = `R${firstRow}C${statusColumn}:C${statusColumn},"UNKNOWN",${total}`;
    const unavailable = `R${firstRow}C${statusColumn}:C${statusColumn},"FALSE",${total}`;
    
    const formula = "=CONCATENATE("
    +`IF(OR(COUNTIFS(${missed}) > 0, COUNTIFS(${prUsed}) > 0), "M: "&COUNTIFS(${missed})&IF(COUNTIFS(${prUsed}) > 0," ("&COUNTIFS(${prUsed})&")","")&CHAR(10),""),`
    +`"R: ",IF(COUNTIFS(${available})+COUNTIFS(${unavailable}) = 0,"★",COUNTIFS(${available})&"|"&COUNTIFS(${unavailable})), IF(COUNTIFS(${unknown}) > 0, " ("&COUNTIFS(${unknown})&")",""),CHAR(10),`
    +`COUNTIFS(${checked}),"/",COUNTIFS(${total}),`
    +")";
    if (totalCell.getFormulaR1C1() !== formula) {
      totalCell.setFormulaR1C1(formula);
    }
    timeEnd();
  }

  /* function _countByType(sheet, _typeColumn) {
    time();
    const counts = {
      _total: {
        checked: 0,
        total: 0,
      },
      _order: []
    };
    if (!_typeColumn) _typeColumn = columns.type;
    if (!_typeColumn || !columns.check) return;
  
    time("data");
    const checkData = checklist.getColumnDataRange(sheet, columns.check).getValues().map((row) => row[0]);
    const typeData = chekclist.getColumnDataRange(sheet, _typeColumn).getValues().map((row) => row[0]);
    timeEnd("data");
    typeData.forEach((type, i) => {
      if (!type || !type.trim()) return;
      if (!counts[type]) {
        counts[type] = {
          checked: 0,
          total: 0,
        };
        counts._order.push(type);
      }
      counts[type].total++;
      counts._total.total++;
      if (checkData[i]) {
        counts[type].checked++;
        counts._total.checked++;
      }
    });
    timeEnd();
    return counts;
  } */

  return {
    updateTotals: updateTotals,
  };
})();