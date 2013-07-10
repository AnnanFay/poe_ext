/* jshint multistr:true, sub:true, forin:false */
/* global
    $,
    ITEM_DATA,
    oRequired,
    oProps,
    oMods,
    oTypes,
    oCalc,
    errorDump */

(function(w) {
    "use strict";

    // exports
    w.parseItem = parseItem;
    w.parseItems = parseItems;

    function parseError(item, message) {
        console.log('<--- error begins...');
        console.log(item);
        console.log(message);
        console.log('error ends --->');
    }

    function parseItem(rawItem, loc) {
        // console.log('parsing item: ', arguments)
        var item = {
            location: loc,
            rarity: '',
            quality: 0,
            name: $.trim(rawItem.name + ' ' + rawItem.typeLine),
            identified: rawItem.identified,
            properties: {},
            explicitMods: {},
            implicitMods: {},
            combinedMods: {},
            requirements: {
                'Level': '1'
            },
            sockets: {},
            calculated: {
                Quantity: 1
            },
            parentCategory: '',
            rawItem: rawItem

        };

        try {

            // item location hacking            
            if (item.location.section !== 'stash') {
                item.location.page = (item.inventoryId === 'MainInventory') ? 'Inventory' : 'Equipped';
            }

            // item rarity
            switch (rawItem.frameType) {
                case 0:
                    item.rarity = 'normal';
                    break;
                case 1:
                    item.rarity = 'magic';
                    break;
                case 2:
                    item.rarity = 'rare';
                    break;
                case 3:
                    item.rarity = 'unique';
                    break;
                case 4:
                    item.rarity = 'skillGem';
                    break;
                case 5:
                    item.rarity = 'currency';
                    item.baseType = item.name;
                    item.calculated.Quantity = rawItem.properties[0].values[0]; //TODO: regex the actual quantity
                    break;
                case 6:
                    item.rarity = 'quest';
                    break;
                default:
                    parseError(item, 'unknown item rarity');
            }

            item.baseType = itemBaseType(item);

            // get the item category
            if (item.rarity === 'skillGem') {
                item.parentCategory = 'Gem';
                item.category = 'Skill Gem';
            } else if (item.rarity === 'quest') {
                item.parentCategory = 'Quest';
                item.category = 'Quest';
            } else if (item.rarity === 'currency') {
                item.parentCategory = 'Currency';
                item.category = 'Currency';
            } else {
                item.parentCategory = ITEM_DATA[item.baseType]['type'];
                item.category = ITEM_DATA[item.baseType]['sub_type'];
            }

            if (item.category === null) {
                parseError(item, 'unknown item category');
            }


            // get properties/mods/requirements into usable format

            if (rawItem.hasOwnProperty('requirements')) {
                item.requirements = nameValueArrayToObj(rawItem.requirements, oRequired, item.requirements);
            }

            // flasks and skillgems have some odd properties etc we don't want in the mix
            if (item.category !== 'Skill Gem' && item.rarity !== 'currency' && item.category !== 'Flask') {

                if (rawItem.hasOwnProperty('properties')) {
                    item.properties = nameValueArrayToObj(rawItem.properties, oProps);
                }
                if (rawItem.hasOwnProperty('explicitMods')) {
                    item.explicitMods = processMods(rawItem.explicitMods, oMods);
                }
                if (rawItem.hasOwnProperty('implicitMods')) {
                    item.implicitMods = processMods(rawItem.implicitMods, oMods);
                }

                // combine explicit and implicit mods
                item.combinedMods = combineMods(item.explicitMods, item.implicitMods);

            }

            item.properties['Base Item'] = item.baseType;
            item.properties['Category'] = item.category;
            item.properties['Parent Category'] = item.parentCategory;

            oProps['Base Item'] = '';
            oProps['Category'] = '';
            oProps['Parent Category'] = '';


            // get quality (gems and flasks need to be checked for this as props weren't parsed...)
            item.quality = itemQuality(item);

            if (item.properties.hasOwnProperty('Quality')) {
                item.properties['Quality'] = item.quality.toString() + '%';
            }

            item.itemRealType = item.baseType;

            if (!oTypes.hasOwnProperty(item.category)) {
                oTypes[item.category] = {};
            }
            if (!oTypes[item.category].hasOwnProperty(item.itemRealType)) {
                oTypes[item.category][item.itemRealType] = '';
            }

            item.rareName = itemRareName(item);

            item.sockets = itemSockets(rawItem);
            //
            // Calculated Properties
            //
            // Damage
            item.calculated['Lightning DPS'] = getAverageDamageOfType(item, 'Lightning Damage');
            item.calculated['Cold DPS'] = getAverageDamageOfType(item, 'Cold Damage');
            item.calculated['Fire DPS'] = getAverageDamageOfType(item, 'Fire Damage');
            item.calculated['Chaos DPS'] = getAverageDamageOfType(item, 'Chaos Damage');
            item.calculated['Physical DPS'] = getAverageDamageOfType(item, 'Physical Damage');

            item.calculated['Elem. DPS'] = getAverageDamageOfTypes(item, ['Fire Damage', 'Cold Damage', 'Lightning Damage']);
            item.calculated['Total DPS'] = averageDamage(item);

            // Sockets / Links
            item.calculated['Max Linked Sockets'] = item.sockets.maxConnected;
            item.calculated['Sockets'] = item.sockets.numSockets;

            // Spell Caster Stuff
            item.calculated['% Elem. Spell Damage'] = getDamageIncreaseOfTypes(item, ['% Spell Damage', '% Elemental Damage', '% Fire Damage', '% Cold Damage', '% Lightning Damage']);
            item.calculated['+ Elem. Gem Levels'] = getSumOfTypes(item, ['+ Level of Cold Gems in this item', '+ Level of Fire Gems in this item', '+ Level of Lightning Gems in this item']);

            // Defensive
            item.calculated['Total % Elem. Resist.'] = getSumOfTypes(item, ['% Fire Resistance', '% Cold Resistance', '% Lightning Resistance', '% Chaos Resistance']);
            item.calculated['Total Defensive %'] = getSumOfTypes(item, ['% Armour', '% Armour and Energy Shield', '% Armour and Evasion', '% Energy Shield', '% Evasion and Energy Shield', '% Evasion Rating']);
            item.calculated['Total Defensive +'] = getSumOfTypes(item, ['+ Armour', '+ Energy Shield', '+ Evasion Rating']);

            /*
            item.linkedSockets = getSocketLinkage(itemDiv);
            item.socketCount = item.sockets === null ? 0 : item.sockets.numSockets;
            */

            // if the cacl'd properties cols aren't yet set, add them all
            if (!oCalc.hasOwnProperty('Average Damage')) {
                for (var key in item.calculated) {
                    oCalc[key] = '';
                }
            }

        } catch (e) {

            console.log('Error parsing item from stash');
            console.log('Raw Item Data:');
            console.log(rawItem);
            console.log('Processed Item');
            console.log(item);

            errorDump(e);

            $('#err')
                .html('An error occured while parsing an item in the stash. Please ' +
                    'click refresh to try again. If the error persists, contact the author.');

        }

        //    item.prefixes = itemPrefixes(item);
        //    item.suffixes = itemSuffixes(item);
        return item;
    }

    function parseItems (rawItems, loc) {
        // console.log('parseItems: ', rawItems, loc);
        return $.map(rawItems, function (rawItem) {
            return parseItem(rawItem, loc);
        })
    }

    function nameValueArrayToObj(aPairs, oKeys, def) {
        var max = aPairs.length;
        var oRet = def || {};
        for (var i = 0; i < max; i++) {

            var key = aPairs[i].name;

            var keylen = aPairs[i].values.length;

            // some properties dont have a value
            if (keylen === 0) {

                oRet[key] = '';

            } else {

                var val = '';

                if (key === "Elemental Damage") {

                    var sItem = "";
                    var oThis = aPairs[i];

                    for (var j = 0; j < keylen; j++) {

                        // add the value of the damage
                        sItem += oThis.values[j][0];

                        // add the type of the elemental damage
                        switch (oThis.values[j][1]) {
                            case 4:
                                sItem += ' (fire)';
                                break;
                            case 5:
                                sItem += ' (cold)';
                                break;
                            case 6:
                                sItem += ' (lightning)';
                                break;
                            default:
                                sItem += '';
                                break;
                        }

                        // skip the last comma
                        if (j < keylen - 1) {
                            sItem += ", ";
                        }
                    }

                    val = sItem;

                } else {

                    val = aPairs[i].values[0][0];
                    if (val[0] === '<') {
                        val = $(val)
                            .text();
                    }
                }

                oRet[key] = val;
                if (!oKeys.hasOwnProperty(key)) {
                    oKeys[key] = '';
                }
            }
        }
        return oRet;
    }

    function averageDamage(item) {

        var dps = 0;

        // if this is a weap, work it out as dps
        // WHY?
        if (item.parentCategory === 'Weapon') {

            // physical
            dps += calcAvRange(item.properties['Physical Damage']);

            // elemental
            if (item.properties.hasOwnProperty('Elemental Damage')) {

                var damageRange = item.properties['Elemental Damage'].split(', ');

                $.map(damageRange, function(range) {
                    dps += calcAvRange(range);
                });

            }

            // Multiply damage by APS
            dps *= parseFloat(item.properties['Attacks per Second']);

        } else {
            // not a weap, add up any damage stats
            dps += item.calculated['Lightning DPS'];
            dps += item.calculated['Cold DPS'];
            dps += item.calculated['Fire DPS'];
            dps += item.calculated['Chaos DPS'];
            dps += item.calculated['Physical DPS'];
        }

        return dps.toFixed(1);
    }

    function getAverageDamageOfType(item, mod) {
        if (item.properties.hasOwnProperty(mod)) {
            return calcAvRange(item.properties[mod]);
        }
        return item.combinedMods.hasOwnProperty(mod) ? calcAvRange(item.combinedMods[mod]) : 0;
    }

    function getAverageDamageOfTypes(item, mods) {
        var total = 0;
        for (var x in mods) {
            var mod = mods[x];
            total += getAverageDamageOfType(item, mod);
        }
        return total;
    }

    function getDamageIncreaseOfType(item, mod) {
        if (item.properties.hasOwnProperty(mod)) {
            return item.properties[mod];
        } else if (item.combinedMods.hasOwnProperty(mod)) {
            return item.combinedMods[mod];
        } else {
            return '0%';
        }
    }

    function getDamageIncreaseOfTypes(item, mods) {
        var total = '0%';
        for (var x in mods) {
            var mod = mods[x];
            total = combineMod(total, getDamageIncreaseOfType(item, mod));
        }
        return total;
    }

    function getOfType(item, mod) {
        if (item.properties.hasOwnProperty(mod)) {
            return item.properties[mod];
        } else if (item.combinedMods.hasOwnProperty(mod)) {
            return item.combinedMods[mod];
        } else {
            return 0;
        }
    }

    function getSumOfTypes(item, mods) {
        var total = 0;
        for (var x in mods) {
            var mod = mods[x];
            total = combineMod(total, getOfType(item, mod));
        }
        return total;
    }

    function calcAvRange(rangeString) {
        var splitRange = rangeString.split(/to|-/);
        return (parseInt(splitRange[0], 10) + parseInt(splitRange[1], 10)) / 2;
    }

    function combineMod(a, b) {
        a = a.toString();
        b = b.toString();
        if (a.indexOf('-') > 0) {
            // range
            a = a.split('-');
            b = b.split('-');
            return (parseInt(a[0], 10) + parseInt(b[0], 10)) + '-' + (parseInt(a[1], 10) + parseInt(b[1], 10));
        } else if (a.indexOf('%') > 0) {
            // percents
            a = parseInt(a.replace('%', ''), 10);
            b = parseInt(b.replace('%', ''), 10);
            return (a + b) + '%';
        } else {
            return parseInt(a, 10) + parseInt(b, 10);
        }
    }

    function combineMods(explicitMods, implicitMods) {

        var oCombined = {};
        var key;
        for (key in explicitMods) {
            oCombined[key] = explicitMods[key];
        }
        for (key in implicitMods) {
            if (oCombined.hasOwnProperty(key)) {

                // can be int, % or range (x-y)
                var a = oCombined[key];
                var b = implicitMods[key];

                var cMod = combineMod(a, b);
                oCombined[key] = cMod;

            } else {
                oCombined[key] = implicitMods[key];
            }
        }

        // add "elemental resistance" onto their respective elements
        if (oCombined.hasOwnProperty('% Elemental Resistances')) {
            var allEleRes = parseInt(oCombined['% Elemental Resistances'], 10);
            oCombined['% Lightning Resistance'] = parseInt(oCombined['% Lightning Resistance'] || 0, 10) + allEleRes + '%';
            oCombined['% Cold Resistance'] = parseInt(oCombined['% Cold Resistance'] || 0, 10) + allEleRes + '%';
            oCombined['% Fire Resistance'] = parseInt(oCombined['% Fire Resistance'] || 0, 10) + allEleRes + '%';
        }

        return oCombined;
    }

    // used by the below functions, better to define them out here. (or in a clusure)
    var bonusRegexp = /^\+?(\d+) ([^A-Z]*)(.*)$/;
    var percentRegexp = /^\+?(\d+%) ([^A-Z]*)(.*)$/;
    var damRegexp = /^Adds (\d+-\d+) (.* Damage)$/i;
    // var positives = ["additional", "increased", "increased maximum", "of", "to", "to all", "to maximum"];
    var negetives = ["reduced", "reduced maximum"];

    function is_negative(word) {
        if (negetives.indexOf($.trim(word)) !== -1) {
            return true;
        }
        return false;
    }

    function processMods(aExplicit, oKeys) {

        var oExplicit = {};
        var aMatch = [];

        for (var i = 0; i < aExplicit.length; i++) {

            var thisMod = aExplicit[i];
            var key = '';
            var prefix = '';

            aMatch = bonusRegexp.exec(thisMod);
            if (aMatch !== null) {
                prefix = is_negative(aMatch[2]) ? "-" : "";
                key = '+ ' + aMatch[3];
            } else {
                aMatch = percentRegexp.exec(thisMod);
                if (aMatch !== null) {
                    prefix = is_negative(aMatch[2]) ? "-" : "";
                    key = '% ' + aMatch[3];
                } else {
                    aMatch = damRegexp.exec(thisMod);
                    if (aMatch !== null) {
                        key = aMatch[2];
                    }
                }
            }

            if (aMatch !== null) {
                oExplicit[key] = prefix + aMatch[1];
                if (!oKeys.hasOwnProperty(key)) {
                    oKeys[key] = '';
                }
            }

            // if (thisMod.indexOf('reduced') !== -1) {
            // // if (aMatch && aMatch[2].indexOf("of") !== -1){
            //      console.log(thisMod, key, is_negative(aMatch[2]));
            // }
        }

        return oExplicit;
    }

    function itemBaseType(item) {
        if (item.rarity === 'currency') {
            return item.baseType;
        }
        if (!item.identified || item.rarity === 'normal') {
            // get rid off the "Superior"
            return item.name.replace(/^Superior /, '');
        }
        if (item.rarity === 'rare') {
            return item.name.split(' ')
                .slice(2)
                .join(' ')
                .replace(/^ /, ''); // some rares have an additional space that needs to be trimmed
        }
        if (item.rarity === 'magic') {
            // get rid of suffix mod
            var baseType = item.name.replace(/\s+of.*$/, '');
            var aWords = baseType.split(' ');

            // we need to check each combination of the words to see if it's in item data.
            // i.e for Ample Sacred Hybrid Flask.
            // check "Ample Sacred Hybrid Flask", "Sacred Hybrid Flask", "Hybrid Flask", etc.
            for (var i = 0; i < aWords.length; i++) {
                var baseName = aWords.slice(i)
                    .join(' ');
                if (baseName in ITEM_DATA) {
                    return baseName;
                }
            }
            // we must have an unrecognised item type
            console.log("Unrecognised item type: " + baseType);
            console.log(item);
            return baseType;
        }
        if (item.rarity === 'unique') {
            if (item.rawItem.typeLine.length > 0) {
                return item.rawItem.typeLine;
            }
        }

        // Quest item or currency
        return item.name;
    }

    function itemRareName(item) {
        if (item.rarity !== 'rare' || !item.identified) {
            return null;
        }

        var splitName = item.name.split(' ');
        var combinedName = splitName[0] + ' ' + splitName[1];

        // some rares have an additional space and wont give an alch
        // if sold to a vendor with a matching rare
        if (splitName[2] === '') {
            combinedName += ' ';
        }

        return combinedName;
    }

    function itemSockets(rawItem) {
        var numSockets = 0;
        var tricolor = false; // Any connected seqs with all three colors?
        var maxConnected = 0; // Max # in a connected seq.

        if (rawItem.hasOwnProperty('sockets')) {
            var linkGroups = [];
            var socket;
            // convert array into a struct of socket groups + number of each socket type
            for (var i in rawItem.sockets) {
                socket = rawItem.sockets[i];
                if (socket.group + 1 > linkGroups.length) {
                    linkGroups[socket.group] = {};
                }
                if (!linkGroups[socket.group].hasOwnProperty(socket.attr)) {
                    linkGroups[socket.group][socket.attr] = 0;
                }
                linkGroups[socket.group][socket.attr] += 1;
            }

            for (var idx in linkGroups) {
                var linkGroup = linkGroups[idx];

                var connectsInGroup = 0;
                var types = 0;
                for (var type in linkGroup) {
                    connectsInGroup += linkGroup[type];
                    types++;
                }
                numSockets += connectsInGroup;
                if (connectsInGroup > maxConnected) {
                    maxConnected = connectsInGroup;
                }
                if (types === 3) {
                    tricolor = true;
                }
            }

        }

        return {
            linkGroups: linkGroups,
            tricolor: tricolor,
            maxConnected: maxConnected,
            numSockets: numSockets
        };
    }

    function itemQuality(item) {
        if (item.category === 'skillGem' || item.category === 'Flask') {

            if (item.rawItem.hasOwnProperty('properties')) {
                for (var i = 0; i < item.rawItem.properties.length; i++) {
                    var oProp = item.rawItem.properties[i];
                    if (oProp.name === 'Quality') {
                        item.properties.Quality = oProp.values[0];
                        return parseInt(oProp.values[0], 10);
                    }
                }
            }

        } else {

            if (item.properties.hasOwnProperty('Quality')) {
                return parseInt(item.properties.Quality, 10);
            }

        }

        return 0;
    }
})(window);