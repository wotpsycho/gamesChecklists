/* exported PRE_REQ_FULFILLED *?
/**
* Determine whether the Pre-Reqs have been fulfilled.
*
* @param {B3} preReqCell The cell that contains the pre-reqs
* @param {A3:A} checkmarkCells The Range that contains the TRUE/FALSE checkmarks; should be 1:1 with third parameter
* @param {C3:C} itemCells The Range that with the name of the possible pre-reqs; should be 1:1 with second parameter
* @returns Whether the pre-preqs have been fulfilled
* @customfunction
* @deprecated Changed onEdit trigger to programatically update, can still use this for one-offs.
*/
/**/
// NOTE: Arguments are hard coded in the reset function, ensure to make updates there as well.
function PRE_REQ_FULFILLED(content,checks,items) {
  try {
    if (!checks || !checks.length || checks[0].length !== 1) {
      throw new Error("Second argument must be a single column range");
    }
    if (!items || !items.length || items[0].length !== 1) {
      throw new Error("Third argument must be a single column range");
    }
    if (checks.length !== items.length) {
      throw new Error("Second and third argument should be single column ranges of the same size");
    }
    if (!content) return true;
  } catch (e) {
    throw new Error("Error processing arguments, please verify content",e); 
  }

  const preReqs = content.split("\n");
  Logger.log(preReqs);
  let fulfilled = true;

  preReqs.forEach((preReq) => {
    let itemNeeded;
    if (/^\s*$/.exec(preReq)) { // empty counts as fulfilled
      return;
    }
    let found = false;
    const multipleCheck = /^(\d+)x +(.*?) *$/.exec(preReq);
    if (multipleCheck) {
      Logger.log("Pre-req multi parsed: requires \"",multipleCheck[1],"\" of \"",multipleCheck[2],"\"");
      const numberNeeded = multipleCheck[1];
      itemNeeded = multipleCheck[2];
      let numChecked = 0;
      let numFound = 0;
      
      for (let j in items) {
        if (items[j][0] && items[j][0].match("^"+itemNeeded)) { 
          Logger.log("found0:",itemNeeded,j,items[j],checks[j]);

          found = true;
          numFound++;
          if(checks[j][0]) {
            Logger.log("found:",itemNeeded,j,items[j],checks[j]);
            numChecked++;
            if (numChecked >= numberNeeded) {
              break;
            }
          }
        }
      }
     
      if (numChecked < numberNeeded) {
        fulfilled = false;
      }
      if (numFound < numberNeeded) {
        throw new Error("There are only " + numFound + " of \"" + itemNeeded + "\", not " + numberNeeded);
      }
    } else {
      itemNeeded = preReq.trim();
      Logger.log("Pre-req single parsed: requires\"", itemNeeded);
      for (let j in items) {
        if (preReq === items[j][0]) {
          found = true;
          if (!checks[j][0]) {
            fulfilled = false;
          }
          break;
        }
      }
    }
    if (!found) {
      throw new Error("\"" + itemNeeded + "\" not found in list of items");
    }
  });
  return fulfilled;
}