// Builds classifiers/eval/manifest.json: labelled, freely licensed photos from Wikimedia Commons.
// Only this list is committed, never the photos. Run with: pnpm exec tsx scripts/eval-manifest.ts
import { writeFileSync } from "node:fs";

const agent = "U-Cut classifier eval (https://github.com/mayank29deo/U-Cut)";
const allowed = /^(CC0|Public domain|PD|CC BY(-SA)? [234]\.0|CC BY(-SA)? 2\.5)/i;
const corePhotos = 140;
const otherPhotos = 50;
/** A cap per source keeps any one place or photographer from dominating a category. */
const perSource = 14;
const pause = () => new Promise((resolve) => setTimeout(resolve, 120));
/** Pictures of the wrong kind of thing: this set is for photographs of places. */
const notAPhoto =
  /\b(map|diagram|plan|logo|scheme|chart|poster|stamp|painting|engraving|drawing|illustration|postcard|sketch|lithograph|cartoon|sign|timetable)\b/i;

// Sources are chosen by hand, by what they are, and never by how well the model scores on them.
// An automatic search filed a rock band called The Beaches under "beach".
const core: Record<string, string[]> = {
  cafe: [
    "Interiors of cafés",
    "Coffee shops",
    "Cafés in Berlin",
    "Cafés in Paris",
    "Cafés in Vienna",
    "Cafés in Rome",
    "Cafés in Istanbul",
    "Cafés in Tokyo",
    "Cafés in Seoul",
    "Cafés in Melbourne",
    "Cafés in Amsterdam",
    "Cafés in Prague",
    "Cafés in Buenos Aires",
    "Cafés in Lisbon",
    "Indian Coffee House",
    "Starbucks",
    "Coffeehouses in Vienna",
    "Coffeehouses in Seattle",
    "Pied Cow Coffeehouse",
    "Allegro Cafe (Seattle)",
  ],
  mountains: [
    "Mountains of Switzerland",
    "Mountains of Nepal",
    "Mountains of Ladakh",
    "Dolomites",
    "Blue Mountains, New South Wales",
    "Mountains of Austria",
    "Mountains of Italy",
    "Mountains of Norway",
    "Mountains of Japan",
    "Mountains of Canada",
    "Mountains of Himachal Pradesh",
    "Mountains of Uttarakhand",
    "Mountains of Georgia (country)",
    "Mountains of Peru",
    "Rocky Mountains",
    "Mountains of Scotland",
  ],
  home: [
    "Living rooms",
    "Bedrooms",
    "Living rooms in the United States",
    "Bedrooms in the United States",
    "Living rooms in Germany",
    "Bedrooms in Germany",
    "Domestic kitchens",
    "Kitchens",
    "Interiors of apartments",
    "Apartment interiors",
    "Living rooms in Japan",
    "Bedrooms in India",
    "Living rooms in India",
  ],
  flight: [
    "Aircraft cabins",
    "Views from airplanes",
    "Airport terminals",
    "Views from aircraft",
    "Aircraft interiors",
    "Airbus A320 cabins",
    "Boeing 737 cabins",
    "Airport check-in",
    "Airport lounges",
    "Boarding gates",
    "Interiors of airport terminals",
    "Indira Gandhi International Airport",
    "Chhatrapati Shivaji Maharaj International Airport",
    "Aircraft wings",
    "Sunsets taken from aircraft",
  ],
  "railway-station": [
    "Howrah railway station",
    "New Delhi railway station",
    "Zürich Hauptbahnhof",
    "Berlin Hauptbahnhof",
    "Train station platforms",
    "Nottingham station railway platforms",
    "Chhatrapati Shivaji Maharaj Terminus",
    "Grand Central Terminal",
    "London Waterloo station",
    "London Paddington station",
    "St Pancras railway station",
    "King's Cross railway station",
    "Gare de Lyon",
    "Gare de l'Est",
    "Milano Centrale railway station",
    "Roma Termini railway station",
    "München Hauptbahnhof",
    "Frankfurt (Main) Hauptbahnhof",
    "Amsterdam Centraal railway station",
    "Tokyo Station",
    "Kyoto Station",
    "Chennai Central railway station",
  ],
  metro: [
    "Delhi Metro stations",
    "Interiors of metro stations",
    "Metro station platforms",
    "Mumbai Metro",
    "Kolkata Metro",
    "Namma Metro",
    "London Underground stations",
    "Paris Métro stations",
    "New York City Subway stations",
    "Moscow Metro stations",
    "Madrid Metro stations",
    "Berlin U-Bahn stations",
    "Seoul Subway",
    "Tokyo Metro stations",
    "Singapore MRT stations",
    "Stockholm metro stations",
    "Barcelona Metro stations",
    "Taipei Metro stations",
  ],
  beach: [
    "Beaches of Goa",
    "Beaches of Portugal",
    "Beaches of California",
    "Beaches of Australia",
    "Beaches of Daytona Beach",
    "Beaches of Thailand",
    "Beaches of Greece",
    "Beaches of Spain",
    "Beaches of Kerala",
    "Beaches of Sri Lanka",
    "Beaches of Hawaii",
    "Beaches of Bali",
    "Beaches of Italy",
    "Beaches of Mexico",
    "Beaches of Brazil",
  ],
  "city-street": [
    "Streets in Mumbai",
    "Streets in Paris",
    "Streets in Tokyo",
    "Streets in Delhi",
    "Streets in London",
    "Streets in Kolkata",
    "Streets in New York City",
    "Streets in Rome",
    "Streets in Bangkok",
    "Streets in Istanbul",
    "Streets in Bangalore",
    "Streets in Berlin",
    "Street scenes in India in the 21st century",
    "Street scenes in Spain in the 21st century",
  ],
  food: [
    "Sushi",
    "Curry",
    "Desserts",
    "Hamburgers",
    "Pasta dishes",
    "Egg dishes of Thailand",
    "Pizza",
    "Salads",
    "Biryani",
    "Dosa",
    "Thali",
    "Pancakes",
    "Ramen",
    "Tacos",
    "Cakes",
    "Noodle dishes",
    "Soups",
  ],
  "night-city": [
    "Night in Shanghai",
    "Cities at night",
    "Night cityscapes",
    "Cityscapes of Bogotá at night",
    "Night cityscapes in Australia",
    "Night cityscapes in Japan",
    "Night cityscapes in Hong Kong",
    "Mumbai at night",
    "New York City at night",
    "Tokyo at night",
    "Paris at night",
    "London at night",
    "Dubai at night",
    "Singapore at night",
  ],
};

const others: Record<string, string[]> = {
  restaurant: [
    "Interiors of restaurants in Kyōto",
    "Interiors of restaurants in Hsinchu County",
    "Restaurant interiors",
    "Interiors of restaurants",
    "Restaurants in Paris",
    "Restaurants in India",
    "Restaurants in London",
  ],
  office: [
    "Offices in Finland",
    "Office interiors",
    "Cubicles",
    "Open-plan offices",
    "Coworking spaces",
    "Home offices",
    "Computer desks",
  ],
  gym: [
    "Fitness centers",
    "Weight training equipment",
    "Exercise machines",
    "Gyms",
    "The Gym Group, Strood",
    "Weight training",
  ],
  lake: [
    "Lakes of Switzerland",
    "Lakes of Killarney",
    "Twin Lakes (Mammoth Lakes, California)",
    "Lakes of India",
    "Lakes of Italy",
    "Lakes of Canada",
    "Rivers of India",
    "Rivers of Germany",
    "Rivers of Japan",
    "Lakes of Norway",
  ],
  forest: [
    "Forests in Mongolia",
    "Drawa Forest",
    "State forests of Pennsylvania",
    "Forests of Germany",
    "Forests of India",
    "Forest paths",
    "Rainforests",
    "Forests of Japan",
  ],
  desert: [
    "Deserts of Australia",
    "Deserts of California",
    "Sahara",
    "Thar Desert",
    "Gobi Desert",
    "Namib",
    "Deserts of Arizona",
  ],
  snow: [
    "Snow in Switzerland",
    "Trees in snow",
    "Snow in Japan",
    "Snow in Germany",
    "Snow in Canada",
    "Snowy landscapes",
  ],
  market: [
    "Street markets in Damascus",
    "Street markets in Galicia (Spain)",
    "Surrey Street Market",
    "Brixton Market",
    "Bazaars in India",
    "Street markets in India",
    "Markets in Thailand",
    "Chandni Chowk",
    "Night markets in Taiwan",
    "Grand Bazaar, Istanbul",
  ],
  temple: [
    "Buddhist temples in Vietnam",
    "Buddhist temples in Nakhon Ratchasima",
    "Hindu temples in Tamil Nadu",
    "Hindu temples in Karnataka",
    "Buddhist temples in Thailand",
    "Hindu temples in Kerala",
  ],
  museum: [
    "Interiors of Volgograd Panorama Museum",
    "Sahip Ata Museum interior",
    "Museum interiors",
    "Art museum interiors",
    "Interior of the Louvre",
    "Interior of the British Museum",
  ],
  train: [
    "Bijapur-Bolarum-HYB Passenger",
    "Bangunkarta Train",
    "Interiors of passenger cars",
    "Interiors of trains",
    "Train interiors",
    "Passenger car interiors",
    "Shinkansen interiors",
    "Train seats",
  ],
  "road-trip": [
    "Yushan Scenic Highway",
    "Views from automobiles",
    "Roads in India",
    "Highways in India",
    "U.S. Route 66",
    "Car interiors",
    "Roads in Norway",
  ],
  bike: [
    "Motorcycles in Japan",
    "Road racing motorcycle riders",
    "Brown motorcycles",
    "Cycling",
    "Bicycles in Amsterdam",
    "Motorcyclists",
    "Royal Enfield Bullet",
    "Bicycle riders",
  ],
  group: [
    "Group photographs",
    "Group photographs of people",
    "Selfies",
    "Group portraits",
    "Friends",
    "Family photographs",
  ],
  pets: [
    "Dog beaches",
    "Domestic cats",
    "Cats sleeping",
    "Golden Retrievers",
    "Labrador Retrievers",
    "Beagles",
    "Kittens",
    "Puppies",
    "Dogs lying down",
  ],
  sky: [
    "Sunsets in unidentified locations",
    "Sunsets of Tokyo",
    "Sunsets of Hokkaido",
    "Sunsets of India",
    "Sunrises",
    "Clouds at sunset",
    "Cumulus clouds",
  ],
  event: [
    "2021 concerts in Budapest",
    "2015 concerts in Budapest",
    "Rock concerts",
    "Music festivals",
    "Glastonbury Festival",
    "Wacken Open Air",
    "Lollapalooza",
    "Concert audiences",
    "Concerts",
  ],
};

interface Page {
  title: string;
  imageinfo?: {
    thumburl?: string;
    descriptionurl?: string;
    mime?: string;
    width?: number;
    height?: number;
    extmetadata?: { LicenseShortName?: { value?: string } };
  }[];
}

interface Item {
  title: string;
  url: string;
  page: string;
  licence: string;
  from: string;
}

function hash(title: string) {
  let value = 0;
  for (const char of title) value = (Math.imul(value, 31) + (char.codePointAt(0) ?? 0)) >>> 0;
  return value;
}

async function api(params: Record<string, string>) {
  const query = new URLSearchParams({ action: "query", format: "json", ...params });
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(`https://commons.wikimedia.org/w/api.php?${query}`, {
      headers: { "user-agent": agent },
    });
    if (response.ok) return (await response.json()) as { query?: Record<string, unknown> };
    await new Promise((resolve) => setTimeout(resolve, 3000 * (attempt + 1)));
  }
  throw new Error("Commons isn't answering.");
}

async function membersOf(category: string): Promise<Item[]> {
  const body = await api({
    generator: "categorymembers",
    gcmtitle: `Category:${category}`,
    gcmtype: "file",
    gcmlimit: "80",
    prop: "imageinfo",
    iiprop: "url|mime|size|extmetadata",
    iiurlwidth: "500",
    iiextmetadatafilter: "LicenseShortName",
  });
  await pause();
  const pages = Object.values((body.query?.pages ?? {}) as Record<string, Page>);
  return pages.flatMap((page) => {
    const info = page.imageinfo?.[0];
    const licence = info?.extmetadata?.LicenseShortName?.value ?? "";
    const short = Math.min(info?.width ?? 0, info?.height ?? 0);
    const long = Math.max(info?.width ?? 0, info?.height ?? 0);
    if (info?.mime !== "image/jpeg" || !info.thumburl || !info.descriptionurl) return [];
    if (short < 600 || long / short > 2 || !allowed.test(licence) || notAPhoto.test(page.title))
      return [];
    return [
      { title: page.title, url: info.thumburl, page: info.descriptionurl, licence, from: category },
    ];
  });
}

/** Stations and streets often sit one folder down, so a whole network counts as one source. */
async function subcategoriesOf(category: string): Promise<string[]> {
  const body = await api({
    list: "categorymembers",
    cmtitle: `Category:${category}`,
    cmtype: "subcat",
    cmlimit: "30",
  });
  await pause();
  const members = (body.query?.categorymembers ?? []) as { title: string }[];
  return members.map((member) => member.title.replace(/^Category:/, ""));
}

async function photosFrom(category: string): Promise<Item[]> {
  const direct = await membersOf(category);
  if (direct.length >= perSource) return direct;
  const found = new Map(direct.map((item) => [item.title, item]));
  for (const child of await subcategoriesOf(category)) {
    if (found.size >= perSource * 3) break;
    for (const item of await membersOf(child)) found.set(item.title, { ...item, from: category });
  }
  return [...found.values()];
}

async function gather(label: string, names: string[], target: number) {
  const bySource: Item[][] = [];
  const counts: string[] = [];
  for (const name of names) {
    const items = (await photosFrom(name)).sort((a, b) => hash(a.title) - hash(b.title));
    counts.push(`${name}: ${items.length}`);
    if (items.length >= 4) bySource.push(items.slice(0, perSource));
  }
  // Takes one from each source in turn, so the set spreads across as many places as it can.
  const taken = new Map<string, Item>();
  while (taken.size < target && bySource.some((items) => items.length > 0)) {
    for (const items of bySource) {
      const item = items.shift();
      if (item && taken.size < target) taken.set(item.title, item);
    }
  }
  const used = new Set([...taken.values()].map((item) => item.from));
  console.log(`${label}: ${taken.size} photos from ${used.size} sources  [${counts.join(", ")}]`);
  return [...taken.values()].map((item) => ({ ...item, label }));
}

const entries: unknown[] = [];
for (const [label, source] of Object.entries(core))
  entries.push(...(await gather(label, source, corePhotos)));
for (const [label, source] of Object.entries(others))
  entries.push(...(await gather(label, source, otherPhotos)));

writeFileSync(
  new URL("../classifiers/eval/manifest.json", import.meta.url),
  `${JSON.stringify(entries, null, 1)}\n`,
);
console.log(`Total: ${entries.length}`);
