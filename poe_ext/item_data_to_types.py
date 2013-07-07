import json
from pprint import pprint

# This is fucked up. For compatability reasons so it works with the original code.
# At some point you'll need to fix the problem at the source. Would be better to draw data directly from data.json

poe_ext_types = {
    "Two Hand Sword": "weapon2h",
    "One Hand Mace": "weapon1h",
    "Dagger": "weapon1h",
    "Two Hand Axe": "weapon2h",
    "Wand": "weapon1h",
    "One Hand Axe": "weapon1h",
    "Bow": "weapon2h",
    "One Hand Sword": "weapon1h",
    "Two Hand Mace": "weapon2h",
    "Thrusting One Hand Sword": "weapon1h",
    "Sceptre": "weapon1h",
    "Claw": "weapon1h",
    "Staff": "weapon2h",
    "Helmet": "head",
    "Body Armour": "chest",
    "Gloves": "hands",
    "Shield": "shield",
    "Boots": "feet",
    "Amulet": "amulet",
    "Ring": "ring",
    "Belt": "belt"
    #"??????????": "map"
    #"??????????": "quiver"
}
# because there's currently no list on the offical poe website.
maps = ["Arachnid Nest Map","Bog Map","Canyon Map","Catacomb Map","Cells Map","Cemetery Map","Coves Map","Crematorium Map","Crypt Map","Dark Forest Map","Dried Lake Map","Dry Peninsula Map","Dry Woods Map","Dunes Map","Dungeon Map","Gorge Map","Graveyard Map","Grotto Map","Jungle Valley Map","Marsh Map","Maze Map","Mine Map","Mountain Ledge Map","Mud Geyser Map","Necropolis Map","Overgrown Ruin Map","Overgrown Shrine Map","Plateau Map","Reef Map","Sewer Map","Shore Map","Spider Forest Map","Spider Lair Map","Springs Map","Strand Map","Subterranean Stream Map","Thicket Map","Tomb Map","Torture Chamber Map","Tropical Island Map","Tunnel Map","Underground River Map","Underground Sea Map","Vaal Pyramid Map","Vaults of Atziri Map","Waste Pool Map"]
quivers = ["Rugged Quiver", "Cured Quiver", "Conductive Quiver", "Heavy Quiver", "Light Quiver"]

#print '"' + '", "'.join(['", "'.join(x.keys()) for x in data.values()]) + '"'

prefix = 'ITEM_TYPE_DATA = '

def main():
    out = {}
    data = json.load(file('data.json', 'r'))

    for p in data:
        for s in data[p]:
            for i in data[p][s]:
                out[i['Name']] = poe_ext_types[s]

    # add the maps
    for m in maps:
        out[m] = 'map'

    for q in quivers:
        out[q] = 'quiver'

    json_string = json.dumps(   out,
                                sort_keys = True,
                                indent = 4,
                                separators = (',', ': '))
    filename = 'itemdata.js'
    f = open(filename, 'w')
    f.write(prefix + json_string)

if __name__ == '__main__':
    main()