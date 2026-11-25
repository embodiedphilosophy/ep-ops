// Programme colours, the same on every Teachers & Email screen (from the Content v2 design)
export const PROGRAM_COLOURS = {
  SS: ['#A5432A', '#fff'], WS: ['#3E6B5A', '#fff'], WSML: ['#20302A', '#F6F1E7'], WSQ: ['#5B4A7A', '#fff'], MM: ['#B98A3E', '#1B1A17'], LRL: ['#2E3F7F', '#fff'],
  CHIT: ['#8E5B3C', '#fff'], LAUNCH: ['#7A2A2F', '#fff'], EVENT: ['#C0434A', '#fff'], SCAFFOLDING: ['#EADDC6', '#1B1A17'],
};
export const colourOf = key => PROGRAM_COLOURS[String(key || '').toUpperCase()] || ['#E7E1D3', '#1B1A17'];
