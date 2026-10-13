// One place for links, prices and numbers used across the site.
// Later this can also be read from the EP master spreadsheet.
export const site = {
  links: {
    signIn: 'https://www.embodiedphilosophy.org/login', // backup only: the live link is Site Links & Prices (sign_in)
    signInWisdom: 'https://school.embodiedphilosophy.com/sign_in', // Wisdom School + Meditation Mondays (Uscreen)
    signInSadhana: 'https://ss.embodiedphilosophy.com/sign_in', // Sādhana School (Circle)
    wisdomJoin: 'https://ss.embodiedphilosophy.com/checkout/wisdom-school?price_id=382924', // Circle paywalls (price_id picks monthly/annual)
    meditationMonthly: 'https://ss.embodiedphilosophy.com/checkout/meditation-pass?price_id=382922',
    meditationYearly: 'https://ss.embodiedphilosophy.com/checkout/meditation-pass?price_id=383461',
    wisdomMonthly: 'https://ss.embodiedphilosophy.com/checkout/wisdom-school?price_id=383465',
    wisdomPlusJoin: 'https://ss.embodiedphilosophy.com/checkout/wisdom-school-plus?price_id=382926',
    wisdomPlusMonthly: 'https://ss.embodiedphilosophy.com/checkout/wisdom-school-plus?price_id=383464',
    ceJoin: '',
    wisdomCatalog: 'https://www.embodiedphilosophy.org/library', // backup only: the live link is Site Links & Prices (catalog)
    // These are backups for when the calendar sheet can't be read. The live links are edited in the dashboard
    // (Content → Website → Links & prices). Kajabi and Uscreen are being retired: point new links at Circle.
    sadhanaYear: 'https://ss.embodiedphilosophy.com/checkout/sadhana-school-year',
    sadhanaSemester: 'https://ss.embodiedphilosophy.com/checkout/sadhana-school-fall',
    quiz: 'https://report.embodiedphilosophy.com/',
    tarkaSubstack: 'https://www.tarkajournal.com',
    tarkaPrint: 'https://www.tarkajournal.com',
    podcast: { spreaker: 'https://www.spreaker.com/podcast/chitheads-with-jacob-kyle-embodied-philosophy--6230267', spotify: 'https://open.spotify.com/show/2A3WSjzEWIeOyrcB3FD3PJ', apple: 'https://podcasts.apple.com/us/podcast/chitheads-with-jacob-kyle-embodied-philosophy/id1046733414', youtube: 'https://www.youtube.com/playlist?list=PL4C_iHX_BB5GednlKTbjhCy9IQ90n9niL', rss: 'https://www.spreaker.com/show/6230267/episodes/feed' },
    social: { instagram: 'https://www.instagram.com/embodiedphilosophy', youtube: 'https://www.youtube.com/channel/UC_yvYg_NrI74IviUUjUEWiQ', facebook: 'https://www.facebook.com/embodiedphilosophy', spotify: 'https://open.spotify.com/show/2A3WSjzEWIeOyrcB3FD3PJ' },
    privacy: 'https://www.iubenda.com/privacy-policy/47854771',
    terms: 'https://www.iubenda.com/terms-and-conditions/47854771',
  },
  prices: {
    dropin: '$14.99',
    ce: '',
    schoolSeat: '$110', schoolLecture: '$600', schoolLicense: '$4,000', schoolMinSeats: '8',
    meditationMonthly: '$9.99',
    meditationYearly: '$99',
    wisdomMonthly: '$27',
    wisdomPlusYear: '$497',
    wisdomPlusMonthly: '$49',
    wisdomYear: '$297',
    sadhanaYear: '$1,497',
    sadhanaSemesterFrom: '$497',
  },
  stats: [
    { n: '100,000+', l: 'In the community' },
    { n: '650+', l: 'Hours of teaching' },
    { n: '100+', l: 'Live practitioners' },
    { n: '2015', l: 'Teaching since' },
    { n: '9', l: 'Issues of Tarka' },
  ],
  sadhanaTheme: 'The Path of Recognition',
  libraryHours: '650+',
};
