import type { Lang } from './LanguageContext'

/**
 * Localized name + description per utility id. The registry
 * (src/utilities/index.ts) holds the English source; this overrides it per
 * language at render time (sidebar + home cards), so the registry stays the
 * single place to add a tool.
 */
type Localized = { name: string; description: string }

const UTILITY_I18N: Record<string, Record<Lang, Localized>> = {
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
      description: 'Convert text between upper, lower, title, kebab and snake case.',
    },
    nl: {
      name: 'Tekst-naamgeving',
      description: 'Zet tekst om tussen hoofdletters, kleine letters, titel-, kebab- en snake-case.',
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
  'stock-tracker': {
    en: {
      name: 'Stock Tracker',
      description:
        'Track a watchlist of prices, charts and fund holdings via Alpha Vantage, FMP (free) or Morningstar.',
    },
    nl: {
      name: 'Aandelenvolger',
      description:
        'Volg een watchlist met koersen, grafieken en fondsposities via Alpha Vantage, FMP (gratis) of Morningstar.',
    },
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
