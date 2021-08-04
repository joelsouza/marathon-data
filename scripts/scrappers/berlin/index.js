import Puppeteer from "puppeteer";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import axios from "axios";
import slugify from "slugify";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const destinationFolder = path.join(
  __dirname,
  "../../../data/",
  "berlin-marathon"
);

// create destination folder
const folderExists = await fs.existsSync(destinationFolder);
if (!folderExists) {
  await fs.mkdirSync(destinationFolder);
}

// initialize
const browser = await Puppeteer.launch();
const page = await browser.newPage();
await page.goto(
  "https://www.bmw-berlin-marathon.com/en/impressions/statistics-and-history/results-archive/"
);

// get all events
const getEvents = async () => {
  return await page.evaluate(async () => {
    eventElement = document.querySelector(".scctiming");
    const events = JSON.parse(eventElement.dataset.events);
    return Object.entries(events).map(([key, value]) => {
      return {
        id: key,
        name: value.title,
        competitions: value.competitions,
      };
    });
  });
};

let events = await getEvents();
await browser.close();

const regex = /([0-9]{4}\ \|\ )|(\.)/gi;
events = events.map((event) => {
  const year = event.name.slice(0, 4);
  const normalizedName = slugify(event.name.replace(regex, "")).toLowerCase();
  return Object.assign(event, {
    name: normalizedName,
    year,
  });
});

const url = "https://www.bmw-berlin-marathon.com/";
const query = {
  eID: "tx_scctiming_results",
  draw: 1,
  length: 5000,
};

for (const event of events) {
  const competition = Object.entries(event.competitions)
    .map(([_, value]) => value)
    .find((competition) => {
      const name = competition.title.toLowerCase().trim();
      return name === "runner" || name == "marathon";
    });

  query.start = 0;
  query.competition = competition.uid;
  query._ = Date.now();

  let total = query.length;
  let runners = [];

  const fileName = path.join(
    destinationFolder,
    `${event.year}-${event.name}.json`
  );
  // start batch
  while (query.start === 0 || runners.length < total) {
    try {
      console.log(event.year, event.name, {
        start: query.start,
        length: query.length,
        total,
        "runners.length": runners.length,
      });
      const response = await axios.get(url, { params: query });
      const marathon = response.data;

      if (query.start === 0) {
        total = marathon.recordsTotal;
      }

      query.start += query.length;
      runners = runners.concat(marathon.data);
    } catch (e) {
      console.error(e);
    }
  }
  await fs.appendFileSync(fileName, JSON.stringify(runners), null, 4);
}

console.log("done!");
process.exit();
