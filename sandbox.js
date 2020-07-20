
/* eslint-disable */

function clearWhitespace() {
  SpreadsheetApp.getActiveRange().trimWhitespace()
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


var info = `
1.0 CHAPTER 1 PHOTO IDEAS (Palm Brinks)

1.1 Cedric's Shop
------------------
register
binoculars
old-style robot
weight gauge
rapper
barrel
fan
tiny hammer
wooden box
vacuum bag
auto book reader
staircase
clock
constructor
vacuum 
cart
table

1.2 Polly's Bakery
------------------
bread
can
flower
oven
register

1.3 Morton's Item Shop
-------------------
book
register
phonograph
milk can
clock
chandelier
vending machine
wheat flour
painting
refrigerator
vegetables/fruit

1.4 Police Station
-------------------
shrubbery
bench
window
post
clock

1.5 Milane's Weapon Shop
--------------------
gold store
lamp
shield
show window
light
weapon
iron maiden
wooden box

1.6 Bar
--------------------
table
lamp
chair
piano
rapper
light
barrel
car
ladder
bottle
wheel
painting

1.7 Train Station
--------------------
shrubbery
flower chair
sign
freight train
clock
staircase
pot
milk can
wooden box
barrel
cup
bottle
bread
trashcan
bench
railroad
Blackstone One

1.8 Street of Palm Brinks
----------------------
shrubbery
bar sign
barrel
lamp
sign
clock
sunshade
window
trashcan
fountain
parasol
cafe sign
chimney
post
streetlight
wooden box
The Moon
pipe
Cedric's Shop Sign
flag
Polly's Bakery Sign
pumpkin
Weapon Shop Sign
mailbox
river
Morton's Sundries Sign
tree
table
bench
drawbridge
traffic light
cart
Police Sign
belt
Morning Sun
The Sun
Evening Sun

1.0 (Underground Channel)
-----------------------------------------
Night Stalker (scoop)
Brave Linda Attack (scoop)
Baron's Hanging On (scoop)
Clown Robo's Attack (scoop)
waterfall
iron bridge
The Moon
The Sun
morning sun
evening sun


2.0 CHAPTER 2 PHOTO IDEAS (Sindain)


2.1 Sindain Station
--------------------
Blackstone One
The Moon
The Sun
railroad
flower
morning sun
evening sun

2.2 Inside Blackstone One
----------------------
coal
fire house

2.3 Sindaine
-----------------
log
rock
grass
withered Jurak
The Sun
The Moon
chimney
morning sun
evening sun
G jurak's eye
G jurak's nose
G gate
G fruit
G tree
G fence
G bench
G water wheel
G bridge
G pot torch
G pot
G cart

2.4 Firbit's House
-------------------
pot
vegetable/fruit
table
wooden bookshelf
hammock
barrel

2.5 Wooden House (Georama Piece)
------------------------------
lamp
bed

2.6 Straw House (Georama Piece)
----------------------------
bed
bottle
lamp
pot
rug

2.0 (Jurak Mall)
2.1 Jurak Mall
--------------------
4. Hmmm! Jurak (scoop)
5. Woody Tailor Sign
2. Mushroom
6. Mushroom Burgers Sign
9. Find the Golden Egg! (scoop)
7. Jurak Arms Sign
7. Quartz

2.0 (Palm Brinks)
2.8 New Outside Areas in Palm Brinks (Across Drawbridge and Past Clowns)
--------------------------------------------------------------------
Parn's Studio Sign
fence
bridge
gate
railroad
rock
monument
pier
boat
Dell Clinic Sign
Ruler of the Pond (scoop)
staircase

2.9 Dell Clinic
-----------------
chair
table
flower
window
book
bottle
egg
eyeball
bone
saw
painting
lamp

2.10 Church
---------------
bench
candle
rug
figure
flower

2.11 Parn's Studio
-------------------
book
ladder
clock
curtain
painting
barrel
cloth
pot
paints
figure
bed
chair
table
dresser
lamp

2.12 Morton's House
-------------------
table
bottle
barrel
lamp
pumpkin
refrigerator
chair
bed
hoe
shrubbery
drawer

2.13 Claire's House
----------------------
chair
flower
shrubbery
clock
window
fireplace
staircase
pot
table
lamp
drawer

2.14 Max's House
--------------------
shrubbery
table
piano
painting
fountain
stained glass
chair
deer horn
rifle
lamp
Elena's portrait
light
bed
drawer
fireplace
book
curtain
flag
pot
palm tree
bench
barrel
stove
vegetables/fruit
ladder
fish
phone
clock
letter
dresser
robot
telescope
chandelier

2.15 City Hall
-----------------
shrubbery
flag
bench
chandelier
book
stand
deer horn
phonograph
glasses case

2.0 (Rainbow Butterfly Woods)
------------------------
Spooky Grass Smile (scoop)
Tore's Nap (scoop)
Floating Earth Digger (scoop)
Dangerous Pumpkin (scoop)
Master Utan (scoop)
King Mardan (scoop)
Gyumo's Yell (scoop)
Lafreccia Stem (scoop)
R. Butterfly United (scoop)
The Sun
The Moon
morning sun
evening sun


3.0 CHAPTER 3 PHOTO IDEAS (Balance Valley)


3.1 Balance Valley Station
-------------------------
Blackstone One
streetlight
bench
lamp

3.2 Balance Valley
----------------------
Lin's House
Torch
The Sun
The Moon
morning sun
evening sun
rock
tree
bridge
chimney
G mailbox
G lamp
G laundry
G fence
G warehouse
G weather vane
G gate
G star lamp
G stained glass
G Holy Emblem
G basket steamer
G Chinese lantern
G rotating sign
G hand-sewn silk flag
G pork dumpling
G well

3.3 Lin's House
-------------------
candle
dresser
barrel
bed
table

3.4 Brick House (Georama Piece)
----------------------------
table
fireplace
drawer
dresser
bed

3.5 Church (Georama Piece)
---------------------------
fresco painting
Saint's Writings
Holy Emblem
Stained glass

3.6 Future Balance Valley
--------------------------
2. torch
2. bridge
5. post
9. horn
10. Moon Crystal (scoop)

3.0 (Starlight Temple)
3.7 Lao Chao's Bistro
-------------------------
7. Lao Chao's Trademark
7. runaway dragon
7. special Peking duck
7. pork dumpling
7. scroll
7. Chinese lantern

3.8 Tool Shop
----------------------------------
8. crescent shaped light
8. starglass
8. peeping pole

3.9 Weapon Shop
-------------------------------------
9. horn
9. pot
9. cloth
9. shield
9. weapon
9. hat

3.0 (Starlight Canyon)
------------------------------------------
giant Yorda tree
The Sun
The Moon
morning sun
evening sun
Charging Ram (scoop)
Face Behind the Devil Mask (scoop)
Changing Dog Statue (scoop)
Hurray for Rock Man! (scoop)
Spinning Ivanoff (scoop)
Nice Massage (scoop)
Burning Dragon Fire (scoop)
Phantom Memo Eater (scoop)
Flying Battleship (scoop)

3.0 (Palm Brinks)
3.11 Fishing Contest Tent
-------------------------------------------------------------------------
Fishing Contest sign (outside)
lamp (outside)
flag (outside)
rapper (outside)
glowing gate
lamp
fish
chair
flag
victory stand
electric bulletin
scale


4.0 CHAPTER 4 PHOTO IDEAS (Veniccio)

4.1 Veniccio Station
-----------------
torch
The Sun
The Moon
morning sun
evening sun
Blackstone One
palm tree
railroad
windmill
rock

4.2 Veniccio
----------------
Luna Stone shards
palm tree
The Moon
The Sun
morning sun
windmill
barrel
fence
red house
torch
sunshade
A Surviving Soldier (scoop)
Veniccio Evening Sun (scoop)
G boat
G staircase
G iron shed
G windmill feather
G Light of Luna Stone

4.3 Pau's Cave
-------------
bottle
pot
lamp
fish
drawer
rug

4.4 Iron House (Georama Piece)
---------------------------
banana
T.V.
bed
small generator
laundry
ventilation
egg-shaped transmitter
barrel

4.5 Future Veniccio
--------------------
9. Symnbol of Luna Lab (scoop)
7. Searchlight

4.6 Luna Lab 1 through 4
----------------------------
2-5. work robot
2-5. energy pipe
2-5. air cleaner
2-5. work equipment
2-5. egg chair

4.7 Central Luna Lab
-------------------------
6. neo-projector
6. work arm
6. system 5WP2
6. futuron 800

4.8 Finny Frenzy Tent
-------------------------
Fish Race Sign (outside)
lamp (outside)
flag (outside)
rapper (outside)
glowing gate
opposed island
chair
flag
water tank
victory stand
electric bulletin

4.0 (Ocean's Roar Cave)
----------------------
Puppet Shingala (scoop)
Ancient Mural (scoop)
Doctor Jaming (scoop)


5.0 CHAPTER 5 PHOTO IDEAS (Heim Rada)

5.1 Heim Rada Stop
---------------
Blackstone One
Railroad
The Sun
evening sun
morning sun

5.2 Heim Rada
---------------
geyser
hot-springs pond
cinders
Hot Springs Spirit (scoop)
Gate
Mount Gundar
The Sun
Evening sun
Morning sun
G generator
G mud
G chimney
G staircase
G power arm
G large crane

5.0 (Gundorada Workshop) 
5.1 Future Heim Rada
------------------
gate
transmission device
post
2. chimney
3. elevator
5. work crane
6. work arm
7. sunshade
10. hammer
8. generator
7. clock
11. Paznos (scoop)

5.4 Item Shop
------------------------------
9. patterned rug
9. book
9. bottle
9. sulphur-colored juice
9. decorative lights
9. sign
9. light

5.5 Weapon Shop
----------------------------------
10. show window
10. hammer
10. light

5.6 Parts Shop
-------------------------------
8. electric sesame
8. decorative lights
8. drum can
8. display robo

5.7 Operations Room
------------------------------------
7. ventilation
7. propeller
7. computer
7. light

5.8 Paznos Bridge
---------------------
11. transmission device
11. Paznos pattern
11. light
11. computer

5.0 (Mount Gundar)
---------------
Bomber Head Boom (scoop)
Fire Squall (scoop)
Flying Battleship (scoop)
Faintin Bone Lord (scoop)
Lava Road (scoop)
Fallen Battleship (scoop)
The Ultimate Gespard (scoop)


6.0 CHAPTER 6 PHOTO IDEAS (Kazarov Stonehenge, Moon Flower Palace, Star Paths)
---------------------
6.0 CHAPTER 6 PHOTO IDEAS (Moon Flower Palace)

6.1 Moon Flower Palace Stop
-------------------------
Ixion (scoop)
gold gate
rock
dead tree
Moon Flower Palace (scoop)

6.2 Inside Ixion
--------------
Pinky

6.3 Moon Flower Palace
------------------
Griffon's Real Face (scoop)
hooked nose
dead tree

6.0 (Kazarov Stonehenge)
--------------------
Ixion
morning sun
evening sun
The Sun
The Moon
Earth Altar
Wind Altar
Fire Altar
Water Altar
Kazarov Stonehenge (scoop)
Gigantor Paznos (scoop)

6.0 (Rainbow Butterfly Woods)
------------------------
Earth Gem Altar (scoop)

6.0 (Starlight Canyon)
-----------------
Wind Gem Altar (scoop)

6.0 (Balance Valley)
----------------
G barrel
G hoe

6.0 (Ocean's Roar Cave)
-----------------
Water Gem Altar (scoop)

6.0 (Mount Gundar)
-------------
Fire Gem Altar (scoop)


7.0 CHAPTER 7 PHOTO IDEAS (Moon Flower Palace)


7.1 Moon Flower Palace Stop
------------------------
gold gate
Ixion (scoop)
The Sun
The Moon
morning sun
evening sun

7.2 Moon Flower Palace Foyer
------------------------
Moon Flower Palace (scoop)

7.3 Moon Flower Palace
--------------------
camellia tree
The Sun
The Moon
morning sun
evening sun
hooked nose
Moon Flower Palace (scoop)
G relaxation fountain
G silver bench
G road to Golbad
G starlight stairway
G starlight tunnel
G flower bed
G moon column
G stardust pond

7.4 Moon Flower Palace Dungeon
----------------------------
blue lantern
flower bathed in light
waterfall curtain
sun chair
sun table
Flower of the Sun (scoop)
lotus flower
Alexandra's bed
Labyrinth door
Flower chandelier
Sun Chamber Gatekeeper (scoop)
golden door

7.5 Dream Spiral
-------------------------------
Legend of the Moon (scoop)


8.0 CHAPTER 8 (Zelmite Mine)
-------------------------------------

8.1 Zelmite Mine
--------------
Flotsam Revived! (scoop)
Zelmite found
Mr. Big Shot's Shadow
`;