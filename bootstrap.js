const fs = require('fs');
const path = require('path');
const Module = require('module');

// Temporary real-audio test mode: inject one curated theme made from
// freely reusable / openly licensed recordings, and disable the stale
// public Jamendo test client so the UI doesn't expose broken themes.
process.env.JAMENDO_CLIENT_ID = '';

const serverPath = path.join(__dirname, 'server.js');
let source = fs.readFileSync(serverPath, 'utf8');

const realTheme = `
  { id: 'classics', name: 'Classiques connus', emoji: '🎻', tracks: [
    ['Für Elise', 'Beethoven', 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Audionautix-com-ccby-furelise.mp3'],
    ['Canon en ré majeur', 'Pachelbel', 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Canon_in_D_Major_%28ISRC_USUAN1100301%29.mp3'],
    ['Le Printemps - Les Quatre Saisons', 'Vivaldi', 'https://files.freemusicarchive.org/storage-freemusicarchive-org/music/MusOpen/Free_Tim/Vivaldis_Spring_from_the_Four_Seasons/Free_Tim_-_Vivaldos_Spring_from_the_Four_Seasons-Allegro.mp3'],
    ['Toccata et fugue en ré mineur', 'Bach', 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Toccata_and_Fugue_in_D_Minor_%28ISRC_USUAN1100350%29.mp3'],
    ['Ouverture de Guillaume Tell', 'Rossini', 'https://archive.org/download/EDIS-SRP-0197-05/EDIS-SRP-0197-05.mp3'],
    ['Le Beau Danube bleu', 'Johann Strauss II', 'https://commons.wikimedia.org/wiki/Special:Redirect/file/%22An_der_sch%C3%B6nen%2C_blauen_Donau%22%2C_performed_by_the_US_Marine_Band.mp3']
  ]},`;

if (!source.includes("const demo = [")) throw new Error('Blind Battle bootstrap: demo marker not found');
source = source.replace("const demo = [", `const demo = [${realTheme}`);

const oldMapper = "if (local) return shuffle(local.tracks).slice(0, n).map(([title, artist, notes]) => ({ title, artist, notes, accepted: [title, artist] }));";
const newMapper = "if (local) return shuffle(local.tracks).slice(0, n).map(([title, artist, media]) => ({ title, artist, ...(Array.isArray(media) ? { notes: media } : { clip: media }), accepted: [title, artist] }));";
if (!source.includes(oldMapper)) throw new Error('Blind Battle bootstrap: queue mapper marker not found');
source = source.replace(oldMapper, newMapper);

// Safety guard: never attempt to start a round if a provider returned an empty queue.
const oldStart = "r.q = await buildQueue(r.themeId, r.roundCount);\n      r.roundIndex = -1;";
const newStart = "r.q = await buildQueue(r.themeId, r.roundCount);\n      if (!Array.isArray(r.q) || r.q.length === 0) throw new Error('empty music queue');\n      r.roundIndex = -1;";
if (!source.includes(oldStart)) throw new Error('Blind Battle bootstrap: start marker not found');
source = source.replace(oldStart, newStart);

const mod = new Module(serverPath, module);
mod.filename = serverPath;
mod.paths = Module._nodeModulePaths(__dirname);
mod._compile(source, serverPath);
