import type { Lang } from './LanguageContext'

/**
 * Localized name + description per utility id. The registry
 * (src/utilities/index.ts) holds the English source; this overrides it per
 * language at render time (sidebar + home cards), so the registry stays the
 * single place to add a tool.
 */
type Localized = { name: string; description: string }

const UTILITY_I18N: Record<string, Record<Lang, Localized>> = {
  'countdown-board': {
    en: { name: 'Countdowns & Time Zones', description: 'Live countdowns to your events and what time it is in your saved cities, with a time planner and embeds for other websites.' },
    nl: { name: 'Aftellers & tijdzones', description: 'Live aftellers naar je evenementen en hoe laat het is in je bewaarde steden, met een tijdplanner en embeds voor andere websites.' },
  },
  'json-tools': {
    en: { name: 'JSON Formatter', description: 'Pretty-print, minify and validate JSON, or diff two documents path by path.' },
    nl: { name: 'JSON-opmaak', description: 'JSON netjes opmaken, verkleinen en valideren, of twee documenten pad per pad vergelijken.' },
  },
  'base64': {
    en: { name: 'Base64', description: 'Encode and decode Base64 for text and files, with UTF-8 and URL-safe support.' },
    nl: { name: 'Base64', description: 'Base64 coderen en decoderen voor tekst en bestanden, met UTF-8 en URL-veilige variant.' },
  },
  'jwt-decoder': {
    en: { name: 'JWT Decoder', description: 'Read a JSON Web Token’s header and claims, check expiry and verify HMAC signatures.' },
    nl: { name: 'JWT-decoder', description: 'Lees de header en claims van een JSON Web Token, controleer de vervaldatum en verifieer HMAC-handtekeningen.' },
  },
  'regex-tester': {
    en: { name: 'Regex Tester', description: 'Test JavaScript regular expressions live with highlighted matches, groups and replacements.' },
    nl: { name: 'Regex-tester', description: 'Test reguliere JavaScript-expressies live met gemarkeerde matches, groepen en vervangingen.' },
  },
  'cron-explainer': {
    en: { name: 'Cron Explainer', description: 'Turn a cron expression into plain language and see its next run times.' },
    nl: { name: 'Cron-uitleg', description: 'Zet een cron-expressie om naar gewone taal en zie wanneer ze de volgende keren draait.' },
  },
  'colour-converter': {
    en: { name: 'Colour Converter', description: 'Convert any CSS colour to HEX, RGB, HSL, OKLCH and more, with WCAG contrast checks.' },
    nl: { name: 'Kleuromzetter', description: 'Zet eender welke CSS-kleur om naar HEX, RGB, HSL, OKLCH en meer, met WCAG-contrastcontroles.' },
  },
  expenses: {
    en: { name: 'Expenses', description: 'Everything that left your accounts each month, sorted into categories like groceries, housing and eating out, from your Bank Viewer transactions.' },
    nl: { name: 'Uitgaven', description: 'Alles wat elke maand van je rekeningen ging, ingedeeld in categorieën zoals boodschappen, wonen en uit eten, op basis van je Bank Viewer-verrichtingen.' },
  },
  'subscription-radar': {
    en: { name: 'Subscription Radar', description: 'Finds recurring charges like streaming, gym and insurance in your Bank Viewer transactions, with monthly and yearly totals, price increases and charges you may have forgotten.' },
    nl: { name: 'Abonnementenradar', description: 'Vindt terugkerende betalingen zoals streaming, fitness en verzekeringen in je Bank Viewer-verrichtingen, met maand- en jaartotalen, prijsstijgingen en betalingen die je misschien vergeten bent.' },
  },
  'bulk-scanner': {
    en: { name: 'Bulk Scanner', description: 'Desktop app for Windows, macOS and Linux: scan batches from a network scanner, name each scan by your own rules and save them as PDFs.' },
    nl: { name: 'Bulkscanner', description: 'Desktopapp voor Windows, macOS en Linux: scan reeksen met een netwerkscanner, geef elke scan een naam volgens je eigen regels en bewaar ze als PDF.' },
  },
  wishlist: {
    en: { name: 'Wishlist', description: 'Collect gift ideas, add product links and share a list with anonymous gift reservations.' },
    nl: { name: 'Verlanglijstjes', description: 'Verzamel cadeau-ideeën, voeg productlinks toe en deel een lijst met anonieme cadeaureserveringen.' },
  },
  'song-listener': {
    en: {
      name: 'Live Lyrics',
      description: 'Identify music through your microphone and follow synchronized lyrics in real time.',
    },
    nl: {
      name: 'Live songtekst',
      description: 'Herken muziek via je microfoon en volg de gesynchroniseerde songtekst in realtime.',
    },
  },
  weather: {
    en: {
      name: 'Weather',
      description: 'Current conditions, forecasts, saved cities, and historical median highs and lows.',
    },
    nl: {
      name: 'Weer',
      description: 'Huidig weer, verwachtingen, bewaarde steden en historische mediane maxima en minima.',
    },
  },
  'fuel-prices': {
    en: {
      name: 'Fuel Prices',
      description: 'Today’s official Belgian maximum prices for Euro 95, Super 98 and diesel, with the recent trend.',
    },
    nl: {
      name: 'Brandstofprijzen',
      description: 'De officiële Belgische maximumprijzen van vandaag voor Euro 95, Super 98 en diesel, met het recente verloop.',
    },
  },
  'image-toolbox': {
    en: {
      name: 'Image Toolbox',
      description: 'Resize, compress and convert images while removing metadata — entirely in your browser.',
    },
    nl: {
      name: 'Afbeeldingstoolbox',
      description: 'Verklein, comprimeer en converteer afbeeldingen en verwijder metadata — volledig in je browser.',
    },
  },
  'image-upscaler': {
    en: {
      name: 'AI Image Upscaler',
      description: 'Enlarge photos and illustrations by 2×, 3× or 4× with self-hosted AI.',
    },
    nl: {
      name: 'AI-afbeeldingsvergroter',
      description: 'Vergroot foto’s en illustraties 2×, 3× of 4× met zelf-gehoste AI.',
    },
  },
  'file-transfer': {
    en: {
      name: 'File Transfer',
      description: 'Upload a file and share it with a private link, with an optional password.',
    },
    nl: {
      name: 'Bestandsoverdracht',
      description: 'Upload een bestand en deel het via een privélink, eventueel met een wachtwoord.',
    },
  },
  'text-case': {
    en: {
      name: 'Text Case Converter',
      description: 'Convert text between upper, lower, title, sentence, camel, Pascal, snake, constant, kebab and dot case.',
    },
    nl: {
      name: 'Hoofdletteromzetter',
      description: 'Zet tekst om tussen hoofdletters, kleine letters, titel-, zins-, camel-, Pascal-, snake-, constant-, kebab- en dot-case.',
    },
  },
  'route-planner': {
    en: {
      name: 'Route Planner',
      description: 'Plan walking, running, cycling, motorcycle and car routes with elevation, directions, GPX export and live GPS navigation.',
    },
    nl: {
      name: 'Routeplanner',
      description: 'Plan wandel-, loop-, fiets-, motor- en autoroutes met hoogteprofiel, routebeschrijving, GPX-export en live GPS-navigatie.',
    },
  },
  'route-optimizer': {
    en: {
      name: 'Shortest Route',
      description: 'Reorder a list of stops into the shortest route and open it in your maps app.',
    },
    nl: {
      name: 'Kortste route',
      description: 'Herschik een lijst stops tot de kortste route en open ze in je kaarten-app.',
    },
  },
  'yt-dlp': {
    en: {
      name: 'Video Downloader',
      description: 'Build a ready-to-run yt-dlp command to download video or audio locally.',
    },
    nl: {
      name: 'Video-downloader',
      description: 'Bouw een kant-en-klaar yt-dlp-commando om video of audio lokaal te downloaden.',
    },
  },
  'qr-code': {
    en: {
      name: 'QR Code Generator',
      description: 'Create styled QR codes for URLs, WiFi, contacts, payments and more.',
    },
    nl: {
      name: 'QR-codegenerator',
      description: 'Maak gestileerde QR-codes voor URLs, wifi, contacten, betalingen en meer.',
    },
  },
  'work-hours': {
    en: {
      name: 'Work Hours',
      description:
        'Track hours worked per week and days off to see how many hours you still owe for the month.',
    },
    nl: {
      name: 'Werkuren',
      description:
        'Houd gewerkte uren per week en vrije dagen bij om te zien hoeveel uren je deze maand nog moet werken.',
    },
  },
  'soccer-predictor': {
    en: {
      name: 'Soccer Predictor',
      description: 'Compare two teams or browse fixtures for a win % and likely scoreline.',
    },
    nl: {
      name: 'Voetbalvoorspeller',
      description: 'Vergelijk twee ploegen of blader door wedstrijden voor een win-% en waarschijnlijke score.',
    },
  },
  'strip-library': {
    en: { name: 'Strip Library', description: 'Scan or type comic album ISBNs, look them up on stripinfo.be and keep track of your collection.' },
    nl: { name: 'Stripbibliotheek', description: 'Scan of typ het ISBN van stripalbums, zoek ze op via stripinfo.be en houd je collectie bij.' },
  },
  'stock-forecast': {
    en: { name: 'Stock Forecast', description: 'Chart real stock, ETF and crypto prices from any market with SMA, EMA and Bollinger overlays, buy/sell signals and trend or Monte Carlo projections.' },
    nl: { name: 'Aandelenprognose', description: 'Grafiek van echte aandelen-, ETF- en cryptokoersen uit elke markt met SMA-, EMA- en Bollinger-lijnen, koop/verkoopsignalen en trend- of Monte Carlo-projecties.' },
  },
  'meal-planner': {
    en: {
      name: 'Meal Planner',
      description: 'Plan a lunch and dinner for each day of the week from your own list of meals.',
    },
    nl: {
      name: 'Maaltijdplanner',
      description: 'Plan een lunch en avondeten voor elke dag van de week uit je eigen maaltijdenlijst.',
    },
  },
  'meme-studio': {
    en: {
      name: 'Meme Studio',
      description:
        'Make memes from trending templates or your own image, GIF or video — add captions, flip and rotate, then download.',
    },
    nl: {
      name: 'Meme Studio',
      description:
        'Maak memes van populaire templates of je eigen afbeelding, GIF of video — voeg bijschriften toe, spiegel en draai, en download.',
    },
  },
  'video-editor': {
    en: {
      name: 'Video Editor',
      description:
        'Stitch local video files on a timeline, layer text, images and colour cards, mix audio tracks, then export to MP4 — all in your browser.',
    },
    nl: {
      name: 'Video-editor',
      description:
        'Voeg lokale videobestanden samen op een tijdlijn, leg tekst, afbeeldingen en kleurkaarten erover, mix audiotracks en exporteer naar MP4 — allemaal in je browser.',
    },
  },
  movies: {
    en: {
      name: 'Movies & TV',
      description:
        'Browse popular, in-theatres/on-air and top-rated movies and TV via TMDB, filter or search, then stream — with saved favourites and watch history.',
    },
    nl: {
      name: 'Films & TV',
      description:
        'Blader door populaire, in de zaal/op tv en best beoordeelde films en series via TMDB, filter of zoek en stream — met favorieten en kijkgeschiedenis.',
    },
  },
}

export function localizedUtility(id: string, lang: Lang, fallback: { name: string; description: string }) {
  return UTILITY_I18N[id]?.[lang] ?? fallback
}
