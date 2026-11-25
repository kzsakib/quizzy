#!/usr/bin/env node
/*
 * Pulls art for every tier list board and writes it into
 * public/images/tierlists/<board>/ plus a credits.json.
 *
 * Three sources:
 *   fandom     character portraits from a Fandom wiki's page images
 *   openverse  openly licensed photographs (CC0 / CC BY / CC BY-SA)
 *   lucide     MIT-licensed line icons, tinted with the board accent
 *
 * Re-run any time to refresh artwork. Every file lands at 176px WebP.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const PX = 176;
const ROOT = process.cwd();
const OUT_ROOT = path.join(ROOT, "public/images/tierlists");

const BOARDS = {
  "jjk-curses-to-befriend": {
    kind: "fandom",
    dir: "jjk",
    wiki: "jujutsu-kaisen",
    credit:
      "Character portraits from the Jujutsu Kaisen Wiki (Fandom). Unofficial fan project, not affiliated with Shueisha or MAPPA.",
    refs: {
      sukuna: "Sukuna",
      mahito: "Mahito",
      jogo: "Jogo",
      hanami: "Hanami",
      dagon: "Dagon",
      choso: "Choso",
      eso: "Eso",
      kechizu: "Kechizu",
      kenjaku: "Kenjaku",
      uraume: "Uraume",
      rika: "Rika Orimoto",
      naoya: "Naoya Zenin",
      ogami: "Ogami",
      kurourushi: "Kurourushi",
      smallpox: "Smallpox Deity",
      ganesha: "Ganesha",
      "finger-bearer": "Finger Bearer",
      grasshopper: "Ko-Guy",
      "cursed-womb": "Cursed Womb: Death Painting",
      haruta: "Haruta Shigemo",
      "cursed-corpse": "Cursed Corpse",
    },
  },
  "pokemon-friend": {
    kind: "fandom",
    dir: "pokemon",
    wiki: "pokemon",
    credit: "Pokémon artwork from the Pokémon Wiki (Fandom). Unofficial fan project.",
    refs: {
      bulbasaur: "Bulbasaur",
      charmander: "Charmander",
      squirtle: "Squirtle",
      pikachu: "Pikachu",
      eevee: "Eevee",
      snorlax: "Snorlax",
      psyduck: "Psyduck",
      jigglypuff: "Jigglypuff",
      gengar: "Gengar",
      mewtwo: "Mewtwo",
      magikarp: "Magikarp",
      gyarados: "Gyarados",
      growlithe: "Growlithe",
      meowth: "Meowth",
      machamp: "Machamp",
      onix: "Onix",
      diglett: "Diglett",
      slowpoke: "Slowpoke",
      lapras: "Lapras",
      ditto: "Ditto",
      "mr-mime": "Mr. Mime",
      sudowoodo: "Sudowoodo",
      wobbuffet: "Wobbuffet",
      togepi: "Togepi",
      lucario: "Lucario",
      gardevoir: "Gardevoir",
      mimikyu: "Mimikyu",
      rowlet: "Rowlet",
      mudkip: "Mudkip",
      trubbish: "Trubbish",
    },
  },
  "office-flood": {
    kind: "fandom",
    dir: "office",
    wiki: "theoffice",
    credit: "Cast photos from The Office Wiki (Fandom). Unofficial fan project.",
    refs: {
      michael: "Michael Scott",
      dwight: "Dwight Schrute",
      jim: "Jim Halpert",
      pam: "Pam Beesly",
      ryan: "Ryan Howard",
      andy: "Andy Bernard",
      kevin: "Kevin Malone",
      angela: "Angela Martin",
      oscar: "Oscar Martinez",
      phyllis: "Phyllis Vance",
      stanley: "Stanley Hudson",
      meredith: "Meredith Palmer",
      creed: "Creed Bratton",
      toby: "Toby Flenderson",
      kelly: "Kelly Kapoor",
      darryl: "Darryl Philbin",
      jan: "Jan Levinson",
      "david-wallace": "David Wallace",
      holly: "Holly Flax",
      erin: "Erin Hannon",
      gabe: "Gabe Lewis",
      "robert-california": "Robert California",
      karen: "Karen Filippelli",
      roy: "Roy Anderson",
      mose: "Mose Schrute",
      nate: "Nate Nickerson",
      "todd-packer": "Todd Packer",
      hank: "Hank Tate",
    },
  },
  "friends-spare-key": {
    kind: "fandom",
    dir: "friends",
    wiki: "friends",
    credit: "Cast photos from the Friends Wiki (Fandom). Unofficial fan project.",
    refs: {
      rachel: "Rachel Green",
      monica: "Monica Geller",
      chandler: "Chandler Bing",
      joey: "Joey Tribbiani",
      phoebe: "Phoebe Buffay",
      ross: "Ross Geller",
      gunther: "Gunther",
      janice: "Janice Litman",
      mike: "Mike Hannigan",
      richard: "Richard Burke",
      emily: "Emily Waltham",
      carol: "Carol Willick",
      susan: "Susan Bunch",
      ben: "Ben Geller",
      "frank-jr": "Frank Buffay Jr.",
      estelle: "Estelle Leonard",
      "mr-heckles": "Mr. Heckles",
      ursula: "Ursula Buffay",
      jack: "Jack Geller",
      tag: "Tag Jones",
      charlie: "Charlie Wheeler",
      gavin: "Gavin Mitchell",
      pete: "Pete Becker",
      judy: "Judy Geller",
    },
  },
  "harry-potter-forest": {
    kind: "fandom",
    dir: "harry-potter",
    wiki: "harrypotter",
    credit: "Character portraits from the Harry Potter Wiki (Fandom). Unofficial fan project.",
    refs: {
      harry: "Harry Potter",
      hermione: "Hermione Granger",
      ron: "Ron Weasley",
      dumbledore: "Albus Dumbledore",
      snape: "Severus Snape",
      mcgonagall: "Minerva McGonagall",
      hagrid: "Rubeus Hagrid",
      draco: "Draco Malfoy",
      neville: "Neville Longbottom",
      luna: "Luna Lovegood",
      ginny: "Ginny Weasley",
      fred: "Fred Weasley",
      george: "George Weasley",
      sirius: "Sirius Black",
      remus: "Remus Lupin",
      tonks: "Nymphadora Tonks",
      moody: "Alastor Moody",
      kingsley: "Kingsley Shacklebolt",
      bellatrix: "Bellatrix Lestrange",
      voldemort: "Lord Voldemort",
      lucius: "Lucius Malfoy",
      dobby: "Dobby",
      kreacher: "Kreacher",
      buckbeak: "Buckbeak",
      fang: "Fang",
      cedric: "Cedric Diggory",
      cho: "Cho Chang",
      seamus: "Seamus Finnigan",
      dean: "Dean Thomas",
      lavender: "Lavender Brown",
    },
  },
  "book-tropes": {
    kind: "lucide",
    dir: "book-tropes",
    accent: "#b5d8ff",
    credit: "Icons from Lucide (MIT licence).",
    refs: {
      "enemies-to-lovers": "swords",
      "forced-proximity": "door-closed",
      "one-bed": "bed-double",
      "fake-dating": "venetian-mask",
      "grumpy-sunshine": "cloud-sun",
      "found-family": "users",
      "chosen-one": "sparkles",
      "love-triangle": "triangle",
      "second-chance": "rotate-ccw",
      "slow-burn": "flame",
      "academic-rivals": "graduation-cap",
      "marriage-of-convenience": "gem",
      "secret-royalty": "crown",
      amnesia: "brain",
      "time-loop": "repeat",
      "heist-crew": "vault",
      "sentient-house": "house",
      "morally-grey": "user-round",
      "villain-redemption": "shield",
      epistolary: "mail",
      "small-town": "store",
      "road-trip": "car",
      bodyguard: "shield-check",
      overheard: "ear",
      miscommunication: "message-circle",
      "age-gap": "hourglass",
      "love-at-first-sight": "eye",
      "tournament-arc": "trophy",
      "mentor-dies": "skull",
      "dog-lives": "dog",
    },
  },
  "pet-peeves": {
    kind: "lucide",
    dir: "pet-peeves",
    accent: "#ff9bbb",
    credit: "Icons from Lucide (MIT licence).",
    refs: {
      "talking-films": "message-square",
      speakerphone: "volume-2",
      "reply-all": "reply-all",
      "late-no-text": "clock",
      chewing: "utensils",
      "carton-sip": "milk",
      spoilers: "eye",
      indicator: "car",
      "nails-train": "scissors",
      "calls-restaurant": "phone",
      vaguebooking: "message-circle",
      "we-need-talk": "circle-alert",
      "trolley-aisle": "shopping-cart",
      "trolley-return": "shopping-basket",
      escalator: "arrow-left",
      "cinema-torch": "flashlight",
      "one-upping": "trending-up",
      borrowing: "package",
      "over-shoulder": "book-open",
      "calm-down": "hand",
      "diet-advice": "apple",
      "keyboard-clicks": "keyboard",
      "toilet-roll": "scroll",
      "butter-crumbs": "cookie",
      "group-chat": "messages-square",
      "k-reply": "message-square-more",
      "early-judge": "alarm-clock",
      "voice-notes": "mic",
      "quiet-carriage": "volume-x",
      whistling: "music",
    },
  },
  "dumb-ways-to-die": {
    kind: "lucide",
    dir: "dumb-ways-to-die",
    accent: "#ff8a8a",
    credit: "Icons from Lucide (MIT licence).",
    refs: {
      "selfie-cliff": "camera",
      "vending-machine": "container",
      "roof-watch-this": "building-2",
      "texting-crossing": "smartphone",
      "wasp-nest": "bug",
      "zoo-fence": "fence",
      "frozen-pole": "thermometer-snowflake",
      "firework-hand": "sparkles",
      "swivel-chair": "armchair",
      "fork-microwave": "microwave",
      "mri-necklace": "magnet",
      "bagel-hand": "utensils",
      "running-scissors": "scissors",
      "phone-in-bath": "droplets",
      "falling-knife": "chef-hat",
      "cactus-photo": "trees",
      "car-nap-engine": "car",
      "shallow-dive": "waves",
      "hill-skateboard": "mountain",
      "ironing-worn": "shirt",
      "train-crossing": "train-front",
      "bear-photo": "paw-print",
      "gas-can-fire": "fuel",
      "pickup-bed": "truck",
      "unknown-bottle": "flask-conical",
      "ladder-powerline": "zap",
      "frozen-lake": "snowflake",
      "hairdryer-tub": "wind",
      "crane-climb": "construction",
      "toaster-knife": "plug-zap",
    },
  },
  "lies-to-avoid-plans": {
    kind: "lucide",
    dir: "lies-to-avoid-plans",
    accent: "#c9a6ff",
    credit: "Icons from Lucide (MIT licence).",
    refs: {
      "stomach-thing": "thermometer",
      "cat-vet": "cat",
      "family-thing": "users",
      "still-at-work": "briefcase",
      "already-in-bed": "bed",
      "phone-died": "battery-low",
      "out-of-town": "plane",
      "double-booked": "calendar-x",
      "mum-car": "car",
      migraine: "pill",
      antibiotics: "syringe",
      "early-flight": "plane-takeoff",
      "mid-move": "package-open",
      "sitter-cancelled": "baby",
      "boiler-leak": "wrench",
      "dog-sitting": "dog",
      "not-people-today": "battery-warning",
      traffic: "traffic-cone",
      dentist: "smile",
      "dry-january": "glass-water",
      "back-gone": "person-standing",
      deadline: "laptop",
      "train-cancelled": "train-front",
      "friend-crisis": "life-buoy",
      "at-parents": "house",
      "at-the-gym": "dumbbell",
      "lost-keys": "key-round",
      "at-the-door": "door-open",
      "lost-track": "clock",
      "still-coughing": "biohazard",
    },
  },
  "kdrama-actors": {
    kind: "wikipedia",
    wiki: "en",
    dir: "kdrama-actors",
    accent: "#8ec9ff",
    credit:
      "Portraits from Wikimedia Commons via Wikipedia. Unofficial fan project.",
    refs: {
      "hyun-bin": "Hyun Bin",
      "gong-yoo": "Gong Yoo",
      "lee-min-ho": "Lee Min-ho",
      "song-joong-ki": "Song Joong-ki",
      "park-seo-joon": "Park Seo-joon",
      "kim-soo-hyun": "Kim Soo-hyun",
      "lee-dong-wook": "Lee Dong-wook",
      "jung-hae-in": "Jung Hae-in",
      "cha-eun-woo": "Cha Eun-woo",
      "nam-joo-hyuk": "Nam Joo-hyuk",
      "park-bo-gum": "Park Bo-gum",
      "seo-in-guk": "Seo In-guk",
      "ji-chang-wook": "Ji Chang-wook",
      "lee-jong-suk": "Lee Jong-suk",
      "kim-woo-bin": "Kim Woo-bin",
      "lee-joon-gi": "Lee Joon-gi",
      "joo-ji-hoon": "Joo Ji-hoon",
      "jang-ki-yong": "Jang Ki-yong",
      "song-kang": "Song Kang",
      "ahn-bo-hyun": "Ahn Bo-hyun",
      rowoon: "Rowoon",
      "kim-young-dae": "Kim Young-dae",
      "hwang-in-youp": "Hwang In-youp",
      "lee-do-hyun": "Lee Do-hyun",
      "byeon-woo-seok": "Byeon Woo-seok",
      "wi-ha-joon": "Wi Ha-joon",
      "kim-seon-ho": "Kim Seon-ho",
      "choi-woo-shik": "Choi Woo-shik",
      "yoo-yeon-seok": "Yoo Yeon-seok",
      "ok-taec-yeon": "Ok Taec-yeon",
    },
  },
  "kdrama-actresses": {
    kind: "wikipedia",
    wiki: "en",
    dir: "kdrama-actresses",
    accent: "#ffa9c6",
    credit:
      "Portraits from Wikimedia Commons via Wikipedia. Unofficial fan project.",
    refs: {
      "song-hye-kyo": "Song Hye-kyo",
      "jun-ji-hyun": "Jun Ji-hyun",
      "kim-tae-ri": "Kim Tae-ri",
      "son-ye-jin": "Son Ye-jin",
      iu: "IU (singer)",
      "park-shin-hye": "Park Shin-hye",
      "kim-go-eun": "Kim Go-eun",
      "han-hyo-joo": "Han Hyo-joo",
      "shin-min-a": "Shin Min-a",
      "seo-ye-ji": "Seo Ye-ji",
      "kim-ji-won": "Kim Ji-won",
      "bae-suzy": "Bae Suzy",
      "park-min-young": "Park Min-young",
      "jung-so-min": "Jung So-min",
      "kim-yoo-jung": "Kim Yoo-jung",
      "lee-sung-kyung": "Lee Sung-kyung",
      "shin-se-kyung": "Shin Se-kyung",
      "moon-ga-young": "Moon Ga-young",
      "seo-hyun-jin": "Seo Hyun-jin",
      "jang-nara": "Jang Nara",
      "kim-hee-sun": "Kim Hee-sun",
      "han-ji-min": "Han Ji-min",
      "lee-bo-young": "Lee Bo-young",
      "kim-hye-soo": "Kim Hye-soo",
      "kim-so-yeon": "Kim So-yeon",
      nana: "Nana (singer)",
      "chun-woo-hee": "Chun Woo-hee",
      "go-min-si": "Go Min-si",
      "kim-da-mi": "Kim Da-mi",
      "jo-bo-ah": "Jo Bo-ah",
    },
  },
  "pokemon-baby-names": {
    kind: "fandom",
    dir: "pokemon-baby-names",
    wiki: "pokemon",
    credit: "Pokémon artwork from the Pokémon Wiki (Fandom). Unofficial fan project.",
    refs: {
      eevee: "Eevee",
      roselia: "Roselia",
      amaura: "Amaura",
      gardevoir: "Gardevoir",
      lucario: "Lucario",
      riolu: "Riolu",
      sylveon: "Sylveon",
      leafeon: "Leafeon",
      glaceon: "Glaceon",
      umbreon: "Umbreon",
      espeon: "Espeon",
      vaporeon: "Vaporeon",
      jolteon: "Jolteon",
      flareon: "Flareon",
      lilligant: "Lilligant",
      bellossom: "Bellossom",
      froslass: "Froslass",
      togepi: "Togepi",
      cleffa: "Cleffa",
      igglybuff: "Igglybuff",
      vulpix: "Vulpix",
      sprigatito: "Sprigatito",
      tinkaton: "Tinkaton",
      mimikyu: "Mimikyu",
      phantump: "Phantump",
      absol: "Absol",
      zorua: "Zorua",
      chikorita: "Chikorita",
      piplup: "Piplup",
      rowlet: "Rowlet",
    },
  },
  "fruits-ranked": {
    kind: "commons",
    dir: "fruits",
    credit:
      "Photographs from Wikimedia Commons, credited in images/tierlists/fruits/credits.json.",
    refs: {
      mango: "mango fruit",
      strawberry: "strawberry fruit",
      watermelon: "watermelon slice",
      grapes: "File:Close up grapes.jpg",
      banana: "bananas",
      apple: "apple fruit",
      orange: "orange fruit",
      pineapple: "File:Pineapple Fruit.jpg",
      peach: "peach fruit",
      cherry: "cherries",
      blueberry: "blueberries",
      raspberry: "raspberries",
      lychee: "lychee fruit",
      pomegranate: "pomegranate fruit",
      kiwi: "kiwi fruit sliced",
      "dragon-fruit": "dragon fruit pitaya",
      papaya: "papaya sliced fruit",
      guava: "guava fruit",
      "passion-fruit": "passion fruit",
      fig: "fig fruit",
      pear: "File:Four pears.jpg",
      plum: "File:Red-Plums.jpg",
      apricot: "apricot fruit",
      cantaloupe: "cantaloupe melon sliced",
      coconut: "coconut half",
      durian: "durian fruit",
      persimmon: "persimmon fruit",
      starfruit: "carambola star fruit",
      jackfruit: "jackfruit pods",
      grapefruit: "grapefruit fruit",
    },
  },
  "ice-cream-flavours": {
    kind: "commons",
    dir: "ice-cream",
    credit:
      "Photographs from Wikimedia Commons, credited in images/tierlists/ice-cream/credits.json.",
    refs: {
      vanilla: "vanilla ice cream",
      chocolate: "chocolate ice cream scoop",
      strawberry: "strawberry ice cream",
      "mint-choc-chip": "mint chocolate chip ice cream",
      "cookies-and-cream":
        "File:Udders Cookies and Cream Ice Cream (cropped).jpg",
      pistachio: "pistachio ice cream",
      "salted-caramel": "File:Salted caramel ice cream (26314112816).jpg",
      coffee: "coffee ice cream",
      mango: "mango ice cream scoop",
      matcha: "matcha ice cream",
      coconut: "coconut ice cream",
      "rum-raisin": "rum raisin ice cream",
      "butter-pecan": "butter pecan ice cream",
      neapolitan: "neapolitan ice cream",
      "rocky-road": "rocky road ice cream",
      "cookie-dough":
        "File:Chocolate chip cookie dough ice cream with orange spoon.jpg",
      banana: "banana ice cream scoop",
      lychee: "lychee ice cream",
      "black-sesame": "black sesame ice cream",
      ube: "ube ice cream",
      taro: "taro ice cream",
      durian: "durian ice cream scoop",
      "olive-oil": "olive oil ice cream",
      "lavender-honey": "lavender honey ice cream",
      bubblegum: "bubblegum ice cream",
      "cotton-candy": "File:Cotton Candy Ice Cream 1 2017-05-12.jpg",
      stracciatella: "stracciatella ice cream",
      honeycomb: "honeycomb ice cream",
    },
  },
  "desserts-fight": {
    kind: "commons",
    dir: "desserts",
    credit: "Photographs from Wikimedia Commons, credited in images/tierlists/desserts/credits.json.",
    refs: {
      tiramisu: "tiramisu",
      "creme-brulee": "creme brulee",
      "lava-cake": "chocolate lava cake",
      cheesecake: "cheesecake slice",
      baklava: "baklava pistachio",
      "gulab-jamun": "gulab jamun",
      "ras-malai": "ras malai",
      "mango-sticky-rice": "khao niao mamuang",
      pavlova: "pavlova dessert",
      "sticky-toffee": "sticky toffee pudding",
      "apple-crumble": "apple crumble",
      brownie: "chocolate brownie",
      "pistachio-gelato": "gelato pistacchio",
      kulfi: "kulfi",
      jalebi: "jalebi",
      falooda: "falooda",
      profiteroles: "profiteroles chocolate",
      "lemon-tart": "lemon tart",
      "carrot-cake": "carrot cake",
      "red-velvet": "red velvet cake",
      "key-lime": "key lime pie",
      banoffee: "banoffee pie",
      "tres-leches": "tres leches cake",
      churros: "churros",
      "panna-cotta": "panna cotta",
      "rice-pudding": "rice pudding",
      "bread-butter": "bread and butter pudding",
      "chimney-cake": "chimney cake",
      mochi: "mochi ice cream",
      "fruit-salad": "fruit salad bowl",
    },
  },
};

const clean = (value) => value.replace(/\s+/g, " ").trim();

async function wikiThumbs(wiki, titles) {
  return hostThumbs(`https://${wiki}.fandom.com/api.php`, wiki, titles);
}

async function hostThumbs(endpoint, label, titles) {
  const url = new URL(endpoint);
  url.search = new URLSearchParams({
    action: "query",
    titles: titles.join("|"),
    prop: "pageimages",
    pithumbsize: "500",
    format: "json",
    redirects: "1",
  }).toString();

  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "QuizzyTierLists/1.0 (https://kzsakib.github.io/quizzy/; fan project)",
    },
  });
  if (!response.ok) throw new Error(`${label}: API ${response.status}`);
  const data = await response.json();
  const thumbs = new Map();
  for (const page of Object.values(data.query.pages)) {
    if (page.thumbnail) thumbs.set(page.title, page.thumbnail.source);
  }
  for (const redirect of data.query.redirects ?? []) {
    const source = thumbs.get(redirect.to);
    if (source) thumbs.set(redirect.from, source);
  }
  return thumbs;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/* Commons answers this VM with 429s when hit quickly, so back off hard. */
async function commonsFetch(url, attempt = 0) {
  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "QuizzyTierLists/1.0 (https://kzsakib.github.io/quizzy/; fan project)",
    },
  });
  if (response.status === 429 && attempt < 4) {
    await sleep(3000 * 2 ** attempt);
    return commonsFetch(url, attempt + 1);
  }
  return response.ok ? response : null;
}

async function commonsPhoto(query) {
  const url = new URL("https://commons.wikimedia.org/w/api.php");
  url.search = new URLSearchParams({
    action: "query",
    generator: "search",
    gsrsearch: `filetype:bitmap ${query}`,
    gsrnamespace: "6",
    gsrlimit: "8",
    prop: "imageinfo",
    iiprop: "url|extmetadata",
    iiurlwidth: "600",
    format: "json",
  }).toString();

  const response = await commonsFetch(url);
  if (!response) return null;
  const data = await response.json();

  const words = query
    .toLowerCase()
    .normalize("NFD")
    .replace(/[^a-z ]/g, "")
    .split(/\s+/)
    .filter((word) => word.length > 3);

  const results = Object.values(data.query?.pages ?? {})
    .filter((page) => page.imageinfo?.[0]?.thumburl)
    .map((page) => ({
      name: page.title.replace(/^File:/, "").toLowerCase(),
      info: page.imageinfo[0],
    }))
    .sort((a, b) => {
      const score = (entry) =>
        words.filter((word) => entry.name.includes(word)).length;
      return score(b) - score(a);
    });

  const pick = results[0];
  if (!pick) return null;
  const meta = pick.info.extmetadata ?? {};
  return {
    url: pick.info.thumburl,
    page: pick.info.descriptionurl,
    creator: meta.Artist?.value?.replace(/<[^>]+>/g, "").trim() || null,
    licence: meta.LicenseShortName?.value || "Wikimedia Commons",
  };
}

async function commonsFile(title) {
  const url = new URL("https://commons.wikimedia.org/w/api.php");
  url.search = new URLSearchParams({
    action: "query",
    titles: title,
    prop: "imageinfo",
    iiprop: "url|extmetadata",
    iiurlwidth: "600",
    format: "json",
  }).toString();

  const response = await commonsFetch(url);
  if (!response) return null;
  const data = await response.json();
  const page = Object.values(data.query?.pages ?? {})[0];
  const info = page?.imageinfo?.[0];
  if (!info?.thumburl) return null;
  const meta = info.extmetadata ?? {};
  return {
    url: info.thumburl,
    page: info.descriptionurl,
    creator: meta.Artist?.value?.replace(/<[^>]+>/g, "").trim() || null,
    licence: meta.LicenseShortName?.value || "Wikimedia Commons",
  };
}

async function openversePhoto(query) {
  const url = new URL("https://api.openverse.org/v1/images/");
  url.search = new URLSearchParams({
    q: query,
    license: "cc0,by,by-sa",
    page_size: "8",
    mature: "false",
  }).toString();

  const response = await fetch(url, {
    headers: { "User-Agent": "quizzy-tierlists/1.0 (fan project)" },
  });
  if (!response.ok) return null;
  const data = await response.json();
  const picks = (data.results ?? []).filter(
    (result) => result.width >= 500 && result.url,
  );
  return picks[0] ?? null;
}

async function fetchBinary(url, attempt = 0) {
  const response = await fetch(url, {
    headers: { "User-Agent": "quizzy-tierlists/1.0 (fan project)" },
  });
  if ((response.status === 429 || response.status >= 500) && attempt < 3) {
    await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1)));
    return fetchBinary(url, attempt + 1);
  }
  if (!response.ok) throw new Error(`${url} → ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

const svgCache = new Map();
async function lucideSvg(name, colour) {
  const key = `${name}:${colour}`;
  if (svgCache.has(key)) return svgCache.get(key);
  const response = await fetch(
    `https://unpkg.com/lucide-static@0.545.0/icons/${name}.svg`,
  );
  if (!response.ok) throw new Error(`icon ${name} → ${response.status}`);
  const svg = (await response.text()).replaceAll("currentColor", colour);
  svgCache.set(key, svg);
  return svg;
}

function square(buffer, position) {
  return sharp(buffer)
    .trim({ threshold: 2 })
    .resize(PX, PX, { fit: "cover", position })
    .webp({ quality: 74, effort: 6 });
}

let failures = 0;

const wanted = process.argv.slice(2);
for (const [slug, board] of Object.entries(BOARDS).filter(
  ([slug]) => wanted.length === 0 || wanted.includes(slug),
)) {
  const dir = path.join(OUT_ROOT, board.dir);
  await mkdir(dir, { recursive: true });

  const listPath = path.join(ROOT, "content/tierlists", `${slug}.json`);
  const list = JSON.parse(await readFile(listPath, "utf8"));
  const onlyArg = process.argv.find((arg) => arg.startsWith("--only="));
  const only = onlyArg ? new Set(onlyArg.slice(7).split(",")) : null;
  const ids = list.items
    .map((item) => item.id)
    .filter((id) => !only || only.has(id));
  const credits = {};
  const missing = [];

  const thumbs =
    board.kind === "fandom"
      ? await wikiThumbs(board.wiki, ids.map((id) => board.refs[id]).filter(Boolean))
      : board.kind === "wikipedia"
        ? await hostThumbs(
            "https://en.wikipedia.org/w/api.php",
            "wikipedia",
            ids.map((id) => board.refs[id]).filter(Boolean),
          )
        : null;

  for (const id of ids) {
    const file = `${id}.webp`;
    const dest = path.join(dir, file);
    const ref = board.refs[id];
    if (!ref) {
      missing.push(id);
      continue;
    }

    try {
      if (board.kind === "fandom") {
        const source = thumbs.get(ref);
        if (!source) {
          missing.push(`${id} (${ref})`);
          continue;
        }
        const buffer = await fetchBinary(source);
        const trimmed = await sharp(buffer).trim({ threshold: 2 }).toBuffer();
        await sharp(trimmed)
          .resize(PX, PX, { fit: "cover", position: "north" })
          .webp({ quality: 74, effort: 6 })
          .toFile(dest);
        credits[file] = {
          character: ref,
          source,
          page: `https://${board.wiki}.fandom.com/wiki/${encodeURIComponent(ref.replaceAll(" ", "_"))}`,
          licence: `Character artwork from the ${board.wiki} Fandom wiki.`,
        };
      } else if (board.kind === "wikipedia") {
        const source = thumbs.get(ref);
        if (!source) {
          const svg = await lucideSvg("user-round", board.accent);
          const icon = await sharp(Buffer.from(svg))
            .resize(Math.round(PX * 0.68), Math.round(PX * 0.68), {
              fit: "contain",
              background: { r: 0, g: 0, b: 0, alpha: 0 },
            })
            .png()
            .toBuffer();
          await sharp({
            create: {
              width: PX,
              height: PX,
              channels: 4,
              background: { r: 0, g: 0, b: 0, alpha: 0 },
            },
          })
            .composite([{ input: icon, gravity: "centre" }])
            .webp({ quality: 80, effort: 6 })
            .toFile(dest);
          credits[file] = {
            icon: "user-round",
            page: `https://en.wikipedia.org/wiki/${encodeURIComponent(ref.replaceAll(" ", "_"))}`,
            licence: "MIT (Lucide), no free portrait available",
          };
          process.stdout.write("o");
          continue;
        }
        const buffer = await fetchBinary(source);
        const trimmed = await sharp(buffer).trim({ threshold: 2 }).toBuffer();
        await sharp(trimmed)
          .resize(PX, PX, { fit: "cover", position: "north" })
          .webp({ quality: 74, effort: 6 })
          .toFile(dest);
        credits[file] = {
          person: ref,
          source,
          page: `https://en.wikipedia.org/wiki/${encodeURIComponent(ref.replaceAll(" ", "_"))}`,
          licence: "Wikimedia Commons via Wikipedia.",
        };
      } else if (board.kind === "commons") {
        await sleep(1200);
        const photo = ref.startsWith("File:")
          ? await commonsFile(ref)
          : ((await commonsPhoto(ref)) ?? (await openversePhoto(ref)));
        if (!photo) {
          missing.push(`${id} (${ref})`);
          continue;
        }
        const buffer = await fetchBinary(photo.url);
        await square(buffer, "centre").toFile(dest);
        credits[file] = {
          subject: ref,
          source: photo.page ?? photo.foreign_landing_url ?? photo.url,
          creator: photo.creator,
          licence: photo.licence ?? photo.license ?? "Wikimedia Commons",
        };
      } else if (board.kind === "openverse") {
        const photo = await openversePhoto(ref);
        if (!photo) {
          missing.push(`${id} (${ref})`);
          continue;
        }
        const buffer = await fetchBinary(photo.url);
        await square(buffer, "centre").toFile(dest);
        credits[file] = {
          subject: ref,
          source: photo.foreign_landing_url ?? photo.url,
          creator: photo.creator,
          licence: `${photo.license?.toUpperCase()} ${photo.license_version ?? ""} — ${photo.source ?? "Openverse"}`,
        };
      } else {
        const svg = await lucideSvg(ref, board.accent);
        const icon = await sharp(Buffer.from(svg))
          .resize(Math.round(PX * 0.68), Math.round(PX * 0.68), {
            fit: "contain",
            background: { r: 0, g: 0, b: 0, alpha: 0 },
          })
          .png()
          .toBuffer();
        await sharp({
          create: {
            width: PX,
            height: PX,
            channels: 4,
            background: { r: 0, g: 0, b: 0, alpha: 0 },
          },
        })
          .composite([{ input: icon, gravity: "centre" }])
          .webp({ quality: 80, effort: 6 })
          .toFile(dest);
        credits[file] = {
          icon: ref,
          page: `https://lucide.dev/icons/${ref}`,
          licence: "MIT (Lucide)",
        };
      }
      process.stdout.write(".");
    } catch (error) {
      missing.push(`${id}: ${error.message}`);
    }
  }

  await writeFile(
    path.join(dir, "credits.json"),
    `${JSON.stringify(credits, null, 2)}\n`,
  );

  for (const item of list.items) {
    if (credits[`${item.id}.webp`] || !only) {
      item.image = `/images/tierlists/${board.dir}/${item.id}.webp`;
    }
  }
  list.credit = board.credit;
  await writeFile(listPath, `${JSON.stringify(list, null, 2)}\n`);

  if (missing.length) {
    failures += missing.length;
    console.log(`\n${slug}: missing ${missing.length} — ${missing.join(", ")}`);
  } else {
    console.log(`\n${slug}: ${ids.length} images`);
  }
}

console.log(
  failures ? `\nDone with ${failures} gap(s).` : "\nAll boards have images.",
);
