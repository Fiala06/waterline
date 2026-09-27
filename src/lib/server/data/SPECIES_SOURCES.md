# Species list sources

`species.json` powers livestock and plant autocomplete. Rebuild it with:

```bash
npm run build:species
```

- **Which species are included, and most common names:** Wikipedia's aquarium species lists, licensed [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). The exact revisions used are recorded in `species.json` under `sources`:
  - [List of freshwater aquarium fish species](https://en.wikipedia.org/wiki/List_of_freshwater_aquarium_fish_species)
  - [List of marine aquarium fish species](https://en.wikipedia.org/wiki/List_of_marine_aquarium_fish_species)
  - [List of freshwater aquarium invertebrate species](https://en.wikipedia.org/wiki/List_of_freshwater_aquarium_invertebrate_species)
  - [List of marine aquarium invertebrate species](https://en.wikipedia.org/wiki/List_of_marine_aquarium_invertebrate_species)
  - [List of freshwater aquarium plant species](https://en.wikipedia.org/wiki/List_of_freshwater_aquarium_plant_species)
- **Extra common names:** [Wikidata](https://www.wikidata.org/) taxon common names and labels, public domain ([CC0](https://creativecommons.org/publicdomain/zero/1.0/)).
- **Hand-kept fixes:** `species-fixes.json`, applied when the app loads, so a rebuild keeps them. It drops entries that aren't species, repeats (a misspelled genus, a second scientific name for Java fern) and junk names, corrects garbled names and typos, adds hobby names neither source has (e.g. "Horned nerite snail" for *Clithon corona*), and adds popular species the sources lack (e.g. the bristlenose pleco). When a species people keep can't be found by what they call it, add it there; `species.test.ts` checks a list of popular species can be found by their usual names.

Because of the Wikipedia part, `species.json` itself is shared under CC BY-SA 4.0 with the attribution above. That applies to this data file only, not to the app's code.

FishBase was considered and not used: its data is licensed for non-commercial use only (CC BY-NC).
