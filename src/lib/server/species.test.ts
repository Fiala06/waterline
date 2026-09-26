import { describe, expect, it } from 'vitest';
import { searchSpecies, speciesCount, type Species } from './species';

// What people type for popular species, and the species it should find in the
// first five results (a genus alone accepts any of its species).
const POPULAR: [string, string, 'fresh' | 'marine', Species['kind']][] = [
	// freshwater fish
	['neon tetra', 'Paracheirodon innesi', 'fresh', 'fish'],
	['cardinal tetra', 'Paracheirodon axelrodi', 'fresh', 'fish'],
	['rummy nose tetra', 'Hemigrammus rhodostomus', 'fresh', 'fish'],
	['black skirt tetra', 'Gymnocorymbus ternetzi', 'fresh', 'fish'],
	['serpae tetra', 'Hyphessobrycon', 'fresh', 'fish'],
	['lemon tetra', 'Hyphessobrycon pulchripinnis', 'fresh', 'fish'],
	['glowlight tetra', 'Hemigrammus erythrozonus', 'fresh', 'fish'],
	['congo tetra', 'Phenacogrammus interruptus', 'fresh', 'fish'],
	['x-ray tetra', 'Pristella maxillaris', 'fresh', 'fish'],
	['bleeding heart tetra', 'Hyphessobrycon erythrostigma', 'fresh', 'fish'],
	['ember tetra', 'Hyphessobrycon amandae', 'fresh', 'fish'],
	['silver dollar', 'Metynnis', 'fresh', 'fish'],
	['emperor tetra', 'Nematobrycon palmeri', 'fresh', 'fish'],
	['penguin tetra', 'Thayeria boehlkei', 'fresh', 'fish'],
	['head and tail light tetra', 'Hemigrammus ocellifer', 'fresh', 'fish'],
	['black neon tetra', 'Hyphessobrycon herbertaxelrodi', 'fresh', 'fish'],
	['harlequin rasbora', 'Trigonostigma heteromorpha', 'fresh', 'fish'],
	['lambchop rasbora', 'Trigonostigma espei', 'fresh', 'fish'],
	['chili rasbora', 'Boraras brigittae', 'fresh', 'fish'],
	['scissortail rasbora', 'Rasbora trilineata', 'fresh', 'fish'],
	['celestial pearl danio', 'Danio margaritatus', 'fresh', 'fish'],
	['galaxy rasbora', 'Danio margaritatus', 'fresh', 'fish'],
	['zebra danio', 'Danio rerio', 'fresh', 'fish'],
	['pearl danio', 'Danio albolineatus', 'fresh', 'fish'],
	['giant danio', 'Devario aequipinnatus', 'fresh', 'fish'],
	['white cloud', 'Tanichthys albonubes', 'fresh', 'fish'],
	['cherry barb', 'Puntius titteya', 'fresh', 'fish'],
	['tiger barb', 'Puntigrus tetrazona', 'fresh', 'fish'],
	['rosy barb', 'Pethia conchonius', 'fresh', 'fish'],
	['gold barb', 'Barbodes semifasciolatus', 'fresh', 'fish'],
	['denison barb', 'Sahyadria denisonii', 'fresh', 'fish'],
	['tinfoil barb', 'Barbonymus schwanenfeldii', 'fresh', 'fish'],
	['guppy', 'Poecilia reticulata', 'fresh', 'fish'],
	['endler', 'Poecilia wingei', 'fresh', 'fish'],
	['platy', 'Xiphophorus maculatus', 'fresh', 'fish'],
	['swordtail', 'Xiphophorus hellerii', 'fresh', 'fish'],
	['molly', 'Poecilia', 'fresh', 'fish'],
	['betta', 'Betta splendens', 'fresh', 'fish'],
	['siamese fighting fish', 'Betta splendens', 'fresh', 'fish'],
	['dwarf gourami', 'Trichogaster lalius', 'fresh', 'fish'],
	['honey gourami', 'Trichogaster chuna', 'fresh', 'fish'],
	['pearl gourami', 'Trichopodus leerii', 'fresh', 'fish'],
	['blue gourami', 'Trichopodus trichopterus', 'fresh', 'fish'],
	['kissing gourami', 'Helostoma temminckii', 'fresh', 'fish'],
	['sparkling gourami', 'Trichopsis pumila', 'fresh', 'fish'],
	['chocolate gourami', 'Sphaerichthys osphromenoides', 'fresh', 'fish'],
	['paradise fish', 'Macropodus opercularis', 'fresh', 'fish'],
	['angelfish', 'Pterophyllum', 'fresh', 'fish'],
	['discus', 'Symphysodon', 'fresh', 'fish'],
	['german blue ram', 'Mikrogeophagus ramirezi', 'fresh', 'fish'],
	['bolivian ram', 'Mikrogeophagus altispinosus', 'fresh', 'fish'],
	['kribensis', 'Pelvicachromis pulcher', 'fresh', 'fish'],
	['convict cichlid', 'Amatitlania nigrofasciata', 'fresh', 'fish'],
	['oscar', 'Astronotus ocellatus', 'fresh', 'fish'],
	['firemouth', 'Thorichthys meeki', 'fresh', 'fish'],
	['jack dempsey', 'Rocio octofasciata', 'fresh', 'fish'],
	['electric yellow', 'Labidochromis caeruleus', 'fresh', 'fish'],
	['cockatoo', 'Apistogramma cacatuoides', 'fresh', 'fish'],
	['electric blue acara', 'Andinoacara', 'fresh', 'fish'],
	['keyhole cichlid', 'Cleithracara maronii', 'fresh', 'fish'],
	['bronze cory', 'Corydoras aeneus', 'fresh', 'fish'],
	['panda cory', 'Corydoras panda', 'fresh', 'fish'],
	['sterbai', 'Corydoras sterbai', 'fresh', 'fish'],
	['pygmy cory', 'Corydoras pygmaeus', 'fresh', 'fish'],
	['julii cory', 'Corydoras julii', 'fresh', 'fish'],
	['peppered cory', 'Corydoras paleatus', 'fresh', 'fish'],
	['bristlenose pleco', 'Ancistrus', 'fresh', 'fish'],
	['common pleco', 'Pterygoplichthys', 'fresh', 'fish'],
	['clown pleco', 'Panaqolus maccus', 'fresh', 'fish'],
	['rubber lip pleco', 'Chaetostoma', 'fresh', 'fish'],
	['zebra pleco', 'Hypancistrus zebra', 'fresh', 'fish'],
	['royal pleco', 'Panaque', 'fresh', 'fish'],
	['otocinclus', 'Otocinclus', 'fresh', 'fish'],
	['oto', 'Otocinclus', 'fresh', 'fish'],
	['siamese algae eater', 'Crossocheilus', 'fresh', 'fish'],
	['chinese algae eater', 'Gyrinocheilus aymonieri', 'fresh', 'fish'],
	['kuhli loach', 'Pangio', 'fresh', 'fish'],
	['clown loach', 'Chromobotia macracanthus', 'fresh', 'fish'],
	['yoyo loach', 'Botia almorhae', 'fresh', 'fish'],
	['zebra loach', 'Botia striata', 'fresh', 'fish'],
	['dwarf chain loach', 'Ambastaia sidthimunki', 'fresh', 'fish'],
	['hillstream loach', 'Sewellia', 'fresh', 'fish'],
	['dojo loach', 'Misgurnus anguillicaudatus', 'fresh', 'fish'],
	['glass catfish', 'Kryptopterus', 'fresh', 'fish'],
	['upside-down catfish', 'Synodontis nigriventris', 'fresh', 'fish'],
	['pictus catfish', 'Pimelodus pictus', 'fresh', 'fish'],
	['bumblebee goby', 'Brachygobius', 'fresh', 'fish'],
	['pea puffer', 'Carinotetraodon travancoricus', 'fresh', 'fish'],
	['boesemani rainbow', 'Melanotaenia boesemani', 'fresh', 'fish'],
	['dwarf neon rainbow', 'Melanotaenia praecox', 'fresh', 'fish'],
	['threadfin rainbow', 'Iriatherina werneri', 'fresh', 'fish'],
	['hatchetfish', 'Carnegiella', 'fresh', 'fish'],
	['black ghost knife', 'Apteronotus albifrons', 'fresh', 'fish'],
	['goldfish', 'Carassius auratus', 'fresh', 'fish'],
	['bala shark', 'Balantiocheilos melanopterus', 'fresh', 'fish'],
	['rainbow shark', 'Epalzeorhynchos frenatum', 'fresh', 'fish'],
	['red tail shark', 'Epalzeorhynchos bicolor', 'fresh', 'fish'],
	['arowana', 'Osteoglossum', 'fresh', 'fish'],
	['peacock gudgeon', 'Tateurndina ocellicauda', 'fresh', 'fish'],
	['ropefish', 'Erpetoichthys calabaricus', 'fresh', 'fish'],
	['senegal bichir', 'Polypterus senegalus', 'fresh', 'fish'],
	['fire eel', 'Mastacembelus erythrotaenia', 'fresh', 'fish'],
	['african butterfly fish', 'Pantodon buchholzi', 'fresh', 'fish'],
	['elephantnose', 'Gnathonemus petersii', 'fresh', 'fish'],
	['medaka', 'Oryzias latipes', 'fresh', 'fish'],
	['killifish', 'Aphyosemion', 'fresh', 'fish'],
	['african dwarf frog', 'Hymenochirus boettgeri', 'fresh', 'fish'],
	// freshwater invertebrates
	['cherry shrimp', 'Neocaridina davidi', 'fresh', 'invert'],
	['red cherry shrimp', 'Neocaridina davidi', 'fresh', 'invert'],
	['blue velvet shrimp', 'Neocaridina davidi', 'fresh', 'invert'],
	['amano shrimp', 'Caridina multidentata', 'fresh', 'invert'],
	['ghost shrimp', 'Palaemonetes paludosus', 'fresh', 'invert'],
	['bamboo shrimp', 'Atyopsis moluccensis', 'fresh', 'invert'],
	['vampire shrimp', 'Atya gabonensis', 'fresh', 'invert'],
	['crystal red shrimp', 'Caridina cantonensis', 'fresh', 'invert'],
	['tiger shrimp', 'Caridina', 'fresh', 'invert'],
	['thai micro crab', 'Limnopilos naiyanetri', 'fresh', 'invert'],
	['red claw crab', 'Perisesarma bidens', 'fresh', 'invert'],
	['electric blue crayfish', 'Procambarus alleni', 'fresh', 'invert'],
	['dwarf orange crayfish', 'Cambarellus patzcuarensis', 'fresh', 'invert'],
	['marbled crayfish', 'Procambarus virginalis', 'fresh', 'invert'],
	['japanese trapdoor snail', 'Cipangopaludina japonica', 'fresh', 'invert'],
	['bladder snail', 'Physella acuta', 'fresh', 'invert'],
	['horned nerite', 'Clithon corona', 'fresh', 'invert'],
	['zebra nerite', 'Neritina natalensis', 'fresh', 'invert'],
	['olive nerite', 'Neritina reclivata', 'fresh', 'invert'],
	['mystery snail', 'Pomacea diffusa', 'fresh', 'invert'],
	['assassin snail', 'Anentome helena', 'fresh', 'invert'],
	['ramshorn snail', 'Planorbella duryi', 'fresh', 'invert'],
	['malaysian trumpet snail', 'Melanoides tuberculata', 'fresh', 'invert'],
	['rabbit snail', 'Tylomelania', 'fresh', 'invert'],
	// freshwater plants
	['java moss', 'Taxiphyllum barbieri', 'fresh', 'plant'],
	['java fern', 'Microsorum pteropus', 'fresh', 'plant'],
	['anubias nana', 'Anubias barteri', 'fresh', 'plant'],
	['amazon sword', 'Echinodorus', 'fresh', 'plant'],
	['water wisteria', 'Hygrophila difformis', 'fresh', 'plant'],
	['hornwort', 'Ceratophyllum demersum', 'fresh', 'plant'],
	['anacharis', 'Elodea densa', 'fresh', 'plant'],
	['duckweed', 'Lemna', 'fresh', 'plant'],
	['amazon frogbit', 'Limnobium laevigatum', 'fresh', 'plant'],
	['red root floater', 'Phyllanthus fluitans', 'fresh', 'plant'],
	['water lettuce', 'Pistia stratiotes', 'fresh', 'plant'],
	['salvinia', 'Salvinia', 'fresh', 'plant'],
	['marimo', 'Aegagropila', 'fresh', 'plant'],
	['moss ball', 'Aegagropila', 'fresh', 'plant'],
	['dwarf hairgrass', 'Eleocharis', 'fresh', 'plant'],
	['monte carlo', 'Micranthemum tweediei', 'fresh', 'plant'],
	['dwarf baby tears', 'Hemianthus callitrichoides', 'fresh', 'plant'],
	['pearlweed', 'Hemianthus micranthemoides', 'fresh', 'plant'],
	['vallisneria', 'Vallisneria', 'fresh', 'plant'],
	['dwarf sagittaria', 'Sagittaria subulata', 'fresh', 'plant'],
	['crypt wendtii', 'Cryptocoryne wendtii', 'fresh', 'plant'],
	['staurogyne repens', 'Staurogyne repens', 'fresh', 'plant'],
	['dwarf hygrophila', 'Hygrophila polysperma', 'fresh', 'plant'],
	['ludwigia repens', 'Ludwigia repens', 'fresh', 'plant'],
	['rotala rotundifolia', 'Rotala rotundifolia', 'fresh', 'plant'],
	['bacopa', 'Bacopa', 'fresh', 'plant'],
	['cabomba', 'Cabomba', 'fresh', 'plant'],
	['brazilian pennywort', 'Hydrocotyle leucocephala', 'fresh', 'plant'],
	['christmas moss', 'Vesicularia montagnei', 'fresh', 'plant'],
	['riccia', 'Riccia fluitans', 'fresh', 'plant'],
	['water sprite', 'Ceratopteris thalictroides', 'fresh', 'plant'],
	['moneywort', 'Bacopa monnieri', 'fresh', 'plant'],
	['tiger lotus', 'Nymphaea', 'fresh', 'plant'],
	['alternanthera', 'Alternanthera', 'fresh', 'plant'],
	['bucephalandra', 'Bucephalandra', 'fresh', 'plant'],
	['guppy grass', 'Najas guadelupensis', 'fresh', 'plant'],
	['pogostemon helferi', 'Pogostemon helferi', 'fresh', 'plant'],
	['micro sword', 'Lilaeopsis', 'fresh', 'plant'],
	['banana plant', 'Nymphoides aquatica', 'fresh', 'plant'],
	['ambulia', 'Limnophila sessiliflora', 'fresh', 'plant'],
	['aponogeton', 'Aponogeton', 'fresh', 'plant'],
	['subwassertang', 'Lomariopsis', 'fresh', 'plant'],
	// reef
	['ocellaris clownfish', 'Amphiprion ocellaris', 'marine', 'fish'],
	['percula clownfish', 'Amphiprion percula', 'marine', 'fish'],
	['maroon clownfish', 'Premnas biaculeatus', 'marine', 'fish'],
	['royal gramma', 'Gramma loreto', 'marine', 'fish'],
	['firefish', 'Nemateleotris magnifica', 'marine', 'fish'],
	['yellow tang', 'Zebrasoma flavescens', 'marine', 'fish'],
	['blue tang', 'Paracanthurus hepatus', 'marine', 'fish'],
	['mandarin', 'Synchiropus splendidus', 'marine', 'fish'],
	['coral beauty', 'Centropyge bispinosa', 'marine', 'fish'],
	['flame angel', 'Centropyge loriculus', 'marine', 'fish'],
	['banggai cardinal', 'Pterapogon kauderni', 'marine', 'fish'],
	['six line wrasse', 'Pseudocheilinus hexataenia', 'marine', 'fish'],
	['yellow watchman goby', 'Cryptocentrus cinctus', 'marine', 'fish'],
	['green chromis', 'Chromis viridis', 'marine', 'fish'],
	['lawnmower blenny', 'Salarias fasciatus', 'marine', 'fish'],
	['diamond goby', 'Valenciennea puellaris', 'marine', 'fish'],
	['cleaner shrimp', 'Lysmata amboinensis', 'marine', 'invert'],
	['peppermint shrimp', 'Lysmata wurdemanni', 'marine', 'invert'],
	['fire shrimp', 'Lysmata debelius', 'marine', 'invert'],
	['coral banded shrimp', 'Stenopus hispidus', 'marine', 'invert'],
	['emerald crab', 'Mithraculus sculptus', 'marine', 'invert'],
	['turbo snail', 'Turbo', 'marine', 'invert'],
	['nassarius snail', 'Nassarius', 'marine', 'invert'],
	['trochus snail', 'Trochus', 'marine', 'invert'],
	['cerith snail', 'Cerithium', 'marine', 'invert'],
	['astrea snail', 'Lithopoma', 'marine', 'invert'],
	['blue leg hermit', 'Clibanarius tricolor', 'marine', 'invert'],
	['scarlet hermit crab', 'Paguristes cadenati', 'marine', 'invert'],
	['tuxedo urchin', 'Mespilia globulus', 'marine', 'invert'],
	['sea cucumber', 'Holothuria', 'marine', 'invert'],
	['berghia', 'Berghia', 'marine', 'invert'],
	['bubble tip anemone', 'Entacmaea quadricolor', 'marine', 'invert'],
	['hammer coral', 'Euphyllia ancora', 'marine', 'invert'],
	['torch coral', 'Euphyllia glabrescens', 'marine', 'invert'],
	['frogspawn', 'Euphyllia divisa', 'marine', 'invert'],
	['duncan coral', 'Duncanopsammia axifuga', 'marine', 'invert'],
	['green star polyp', 'Briareum', 'marine', 'invert'],
	['zoanthid', 'Zoanthus', 'marine', 'invert'],
	['palythoa', 'Palythoa', 'marine', 'invert'],
	['mushroom coral', 'Discosoma', 'marine', 'invert'],
	['xenia', 'Xenia', 'marine', 'invert'],
	['toadstool leather', 'Sarcophyton', 'marine', 'invert'],
	['kenya tree', 'Capnella', 'marine', 'invert'],
	['acan', 'Micromussa lordhowensis', 'marine', 'invert'],
	['montipora', 'Montipora', 'marine', 'invert'],
	['acropora', 'Acropora', 'marine', 'invert'],
	['birds nest coral', 'Seriatopora hystrix', 'marine', 'invert'],
	['candy cane coral', 'Caulastrea furcata', 'marine', 'invert'],
];

describe('species list', () => {
	it('bundles a couple of thousand species', () => {
		expect(speciesCount).toBeGreaterThan(2000);
	});

	it('finds species by common name', () => {
		expect(searchSpecies('neon tetra')[0].s).toBe('Paracheirodon innesi');
		expect(searchSpecies('amano')[0].s).toBe('Caridina multidentata');
	});

	it('finds species by scientific name', () => {
		expect(searchSpecies('Betta splen')[0].s).toBe('Betta splendens');
		expect(searchSpecies('crypt wendtii')[0].s).toBe('Cryptocoryne wendtii');
	});

	it('filters by fresh or marine water', () => {
		const marine = searchSpecies('clown', { water: 'marine' });
		expect(marine.length).toBeGreaterThan(0);
		expect(marine.every((s) => s.water === 'marine')).toBe(true);
	});

	it('ignores very short queries', () => {
		expect(searchSpecies('a')).toEqual([]);
	});

	it.each(POPULAR)('"%s" finds %s', (q, sci, water, kind) => {
		const found = searchSpecies(q, { water, kind, limit: 5 }).map((s) => s.s);
		const hit = (s: string) => s === sci || (!sci.includes(' ') && s.split(' ')[0] === sci);
		expect(found.some(hit), `top 5: ${found.join(', ')}`).toBe(true);
	});

	it('ignores hyphens, apostrophes and spacing', () => {
		expect(searchSpecies('rummy nose tetra')[0].s).toBe('Hemigrammus rhodostomus');
		expect(searchSpecies('denison barb')[0].s).toBe('Sahyadria denisonii');
		expect(searchSpecies('bubble tip anemone')[0].s).toBe('Entacmaea quadricolor');
		expect(searchSpecies('firefish', { water: 'marine' })[0].s).toBe('Nemateleotris magnifica');
	});

	it('ranks common names above scientific ones', () => {
		expect(searchSpecies('betta', { kind: 'fish' })[0].s).toBe('Betta splendens');
		expect(searchSpecies('platy', { kind: 'fish' })[0].s).toMatch(/^Xiphophorus /);
	});

	it('shows and saves the name that matched', () => {
		const [shrimp] = searchSpecies('blue velvet', { kind: 'invert' });
		expect(shrimp.s).toBe('Neocaridina davidi');
		expect(shrimp.c[0]).toBe('Blue velvet shrimp');
		expect(searchSpecies('horned nerite')[0].c[0]).toBe('Horned nerite snail');
		// matched on the scientific name: its usual first name
		expect(searchSpecies('Planorbella duryi')[0].c[0]).toBe('Ramshorn snail');
		expect(searchSpecies('Caridina multidentata')[0].c[0]).toBe('Amano shrimp');
	});

	it('leaves out what the source tables got wrong', () => {
		expect(searchSpecies('guppies and')).toEqual([]);
		expect(searchSpecies('guppy', { kind: 'fish' })[0].c[0]).toBe('Guppy');
		expect(searchSpecies('needs quality image')).toEqual([]);
		expect(searchSpecies('cichild')).toEqual([]);
	});
});
