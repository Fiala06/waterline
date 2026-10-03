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

FishBase was considered and not used for the list: its data is licensed for non-commercial use only (CC BY-NC).

## Care ranges (#20)

Temperature, pH and hardness ranges, adult size and schooling come from [FishBase](https://www.fishbase.org) (CC BY-NC 4.0), and are **not in the repository**: each server downloads the snapshot [rfishbase](https://github.com/ropensci/rfishbase) publishes on Source Cooperative (`species`, `synonyms`, `stocks` and `ecology` as Parquet), keeps the rows that match the fish in `species.json` by scientific name (accepted or a synonym: the hobby's *Corydoras paleatus* is FishBase's *Hoplisoma paleatum*) in `DATA_DIR/species-care.json`, and credits FishBase wherever the data is shown (`src/lib/server/species-care.ts`). `SPECIES_CARE=off` or the switch in Server settings turns it off; `SPECIES_CARE_URL` reads another snapshot folder. Group sizes and the compatibility list (`src/lib/compatibility.json`) are Waterline's own, short and cautious.
