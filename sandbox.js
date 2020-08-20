
/* eslint-disable */

function timeRangeStuff() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('DC2');
  let range;
  for (var i = 0; i < 10; i++) {
    time("getA1Range");
    range = sheet.getRange("A1:B4");
    timeEnd("getA1Range");
  }
  for (var i = 0; i < 10; i++) {
    time("getLastRange");
    range.getLastColumn();
    timeEnd("getLastRange");
  }
  for (var i = 0; i < 10; i++) {
    time("get2Range");
    range.getCell(2,2).getValue();
    timeEnd("get2Range");
  }
  for (var i = 0; i < 10; i++) {
    time("getLastRange3");
    range.getLastColumn();
    timeEnd("getLastRange3");
  }
}

function clearWhitespace() {
  SpreadsheetApp.getActiveRange().trimWhitespace()
}

function activeSheetTest() {
  const sheet = SpreadsheetApp.getActiveSheet();
  return [sheet.getName(), sheet.getActiveRange().getA1Notation(),SpreadsheetApp.getActiveSpreadsheet().getName(),SpreadsheetApp.getActiveRange()];
}

function metaData() {
  time();
  try {
    time("active sheet")
    const sheet = SpreadsheetApp.getActiveSheet();
    timeEnd("active sheet")
    time("metadata");
    const sheetMetadatas = sheet.getDeveloperMetadata();
    timeEnd("metadata");
    time("processMeta");
    const metadata = {};
    sheetMetadatas.forEach((metadataObject,i) => {
      time("metaValues " + i);
      const [key,value] = [metadataObject.getKey(), metadataObject.getValue()];
      timeEnd("metaValues " + i);
      if (Object.hasOwnProperty.call(metadata,key)) {
        console.warn("Found duplicate metadata \"%s\" for sheet \"%s\", removing", key, sheet.getName());
        metadataObject.remove();
      } else {
        console.log("Found metadata key \"%s\" with value \"%s\"", key, value);
        metadata[key] = value;
      }
    });
    timeEnd("processMeta");

    console.log(metadata);
    return metadata;
  } finally {
    timeEnd();
  }
}

function test(){
  var a = "hello\nworld";
  var b = "hello";
  var reg = /^(hello\n|hello$)/;
  console.log(reg.exec(a), reg.exec(b));
  /* 
  ['hello\n',
  'hello\n',
  index: 0,
  input: 'hello\nworld',
  groups: undefined ] [ 'hello', 'hello', index: 0, input: 'hello', groups: undefined ]
*/
}

function lighten() {
  var color = "#0479ac";
  
  var r = parseInt(color.slice(1,3),16);
  var g = parseInt(color.slice(3,5),16);
  var b = parseInt(color.slice(5,7),16);
  var newR = parseInt((r+255)/2);
  var newG = parseInt((g+255)/2);
  var newB = parseInt((b+255)/2);
  var newColor = "#" + newR.toString(16) + newG.toString(16) + newB.toString(16);
  
  console.log(newColor, newR,newG,newB);
  
}

function alphaToNum() {
  var colAlphas = ["A","M","Z","AA","AQ","AZ","BA","BB","ZZ","AAA","CDA"];
  for (var j = 0; j < colAlphas.length; j++) {
    var colAlpha = colAlphas[j];
    var column = 0;
    for (var i = colAlpha.length-1; i >= 0; i--) {
      var alpha = colAlpha.charAt(colAlpha.length - i - 1);
      var num = parseInt(alpha,36)-9;
      var poweredNum = num * Math.pow(26, i);
      column += poweredNum;
      console.log("[i,alpha,num,poweredNum,Math.pow(26,i),column]",[i,alpha,num,poweredNum,Math.pow(26,i),column])
    }
    console.log("[colAlpha,column]",[colAlpha,column])
  }
    
}

function regexagain() {
  var whole, first, last;
  var regex = /(?:^(?:\(add\))? *(.+?) *(?:: *(.*?))? *$)/;
  [whole,first,last] = regex.exec("Hello: world");
  console.log([whole,first,last]);
  [whole,first,last] = regex.exec("Hello: ");
  console.log([whole,first,last]);
  [whole,first,last] = regex.exec("Hello ");
  console.log([whole,first,last]);
  [,first,last] = regex.exec(" Mode : View  ");
  console.log([whole,first,last]);
  [,first,last] = regex.exec("(add) Mode : View  ");
  console.log([whole,first,last]);
}

function figureLines() {
  console.log(SpreadsheetApp.getActiveRange().getBandings());
  console.log(SpreadsheetApp.getActiveRange().getBackground());
  console.log(SpreadsheetApp.getActiveRange().getBorder().getBottom());
  console.log(SpreadsheetApp.getActiveRange().getBorder().getTop());
  console.log(SpreadsheetApp.getActiveRange().getBorder().getLeft());
  console.log(SpreadsheetApp.getActiveRange().getBorder().getRight());
  console.log(SpreadsheetApp.getActiveRange().getBorder().getBottom().getBorderStyle()+"");
  console.log(SpreadsheetApp.getActiveRange().getBorder().getTop().getBorderStyle()+"");
  console.log(SpreadsheetApp.getActiveRange().getBorder().getLeft().getBorderStyle()+"");
  console.log(SpreadsheetApp.getActiveRange().getBorder().getRight().getBorderStyle()+"")
  console.log(SpreadsheetApp.getActiveRange().getBorder().getBottom().getColor());
  console.log(SpreadsheetApp.getActiveRange().getBorder().getTop().getColor());
  console.log(SpreadsheetApp.getActiveRange().getBorder().getLeft().getColor());
  console.log(SpreadsheetApp.getActiveRange().getBorder().getRight().getColor());
  console.log(SpreadsheetApp.getActiveRange());
  console.log(SpreadsheetApp.getActiveRange());
  console.log(SpreadsheetApp.getActiveRange());
  console.log(SpreadsheetApp.getActiveRange());
  console.log(SpreadsheetApp.getActiveRange());
  console.log(SpreadsheetApp.getActiveRange());
  console.log(SpreadsheetApp.getActiveRange());
  console.log(SpreadsheetApp.getActiveRange());
  console.log(SpreadsheetApp.getActiveRange());
  console.log(SpreadsheetApp.getActiveRange());
  console.log(SpreadsheetApp.getActiveRange());
  console.log(SpreadsheetApp.getActiveRange());
  console.log(SpreadsheetApp.getActiveRange());
  console.log(SpreadsheetApp.getActiveRange());
}


function parseInfo() {
  var infoLines = info.split('\n');
  var currentArea;
  var currentLocation;
  var currentLocationNote;
  var items = {
    _itemOrder: [],
  };
  var areaRegex = /^[1-8]\.0 .*?\((.*)\) *$/;
  var locationRegex = /^[1-8]\.[1-9][0-9]* (.+?) *(?:\((.*)\))? *$/;
  var itemRegex = /^(G)?([1-9](?:[0-9])?(?:\-[1-9])?\.)? *(.+?) *(?:\((.+?)\))? *$/;
  var skipRegex = /^-* *$/;
  var fixCaps = function(item) {
    var itemParts = item.split(/\b/);
    for (var i = 0; i < itemParts.length; i++) {
      var word = itemParts[i];
      if (word.length > 0 && word !== "s") {
        itemParts[i] = word[0].toUpperCase() + word.substring(1);
      }
    }
    return itemParts.join("");
  };
  for (var i = 0; i < infoLines.length; i++) {
    var line = infoLines[i];
    if (line.match(skipRegex)) continue;
    var [,area] = areaRegex.exec(line) || [];
    if (area) {
      currentArea = currentLocation = area;
      continue;
    }
    var [,location,note] = locationRegex.exec(line) || [];
    if (location) {
      currentLocation = location;
      currentLocationNote = note;
      continue;
    }
    var [,isGeorama,geoPreReq,itemName,itemNote] = itemRegex.exec(line) || [];
    if (itemName) {
      itemName = fixCaps(itemName);
      var item = items[itemName];
      if (!items.hasOwnProperty(itemName)) {
        items[itemName] = {
          name: itemName,
          notes: [],
          areaOrder: [],
          preReqs: [],
          type: "Photo",
        };
        items._itemOrder.push(itemName);
        item = items[itemName];
      }
      if (itemNote) {
        if (itemNote == "scoop") item.type = "Scoop";
        else item.notes.unshift(itemNote);
      }
      if (isGeorama && !item.georama) {
        item.georama = true;
        item.notes.push("Georama Part");
      }
      if (geoPreReq) {
        item.notes.push("Has georama pre-req: " + currentArea + " " + geoPreReq);
        item.preReqs.push(geoPreReq + currentArea);
      }
      if (!item) {
        throw new Error("Item: " + itemName + ":" + item);
      }
      if (!item.hasOwnProperty(currentArea)) {
        item[currentArea] = {
          locationOrder: [],
        };
        item.areaOrder.push(currentArea);
      }
      var area = item[currentArea];
      if (!area.hasOwnProperty(currentLocation)) {
        area[currentLocation] = true;
        area.locationOrder.push(currentLocation);
      }
      if (currentLocationNote) {
        item.notes.push(currentLocation + ": " + currentLocationNote);
      }
      continue;
    }
    throw new Error("Line does not match: " + line);
  }
  var rowResults = [];
  items._itemOrder.forEach(function(itemName){
    var item = items[itemName];
    var rowResult = '"' + item.type + '"\t';
    rowResult += '"' + itemName + '"\t';
    var areaResults = [];
    var locationResults = [];
    item.areaOrder.forEach(function(areaName) {
      var area = item[areaName];
      areaResults.push(areaName);
      locationResults.push(area.locationOrder.join(", "));
    });
    rowResult += '"' + areaResults.join("\n") + '"\t';
    rowResult += '"' + locationResults.join("\n") + '"\t';
    rowResult += '"' + item.preReqs.join("\n") + '"\t';
    rowResult += '"' + item.notes.join("\n") + '"';
    rowResults.push(rowResult);
  });
  while (rowResults.length) {
    var results = rowResults.splice(0,50);
    console.log("\n\n\n",results.join("\n"),"\n\n\n\n");
  }
  //console.log("\n\n\n",rowResults.join("\n"),"\n\n\n\n");
  var a = "stop";
}
//4. Hmmm! Jurak (scoop)
//G bench
//2-5. work robot
//3.8 something (Georama Piece)
//"Photo""Something""Palm Brinks","Place1
//Place2","Location","","Notes?"