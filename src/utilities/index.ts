import { lazy } from 'react'
import { registerUtility } from './registry'
import {
  wishlistIcon,
  textCaseIcon,
  jsonIcon,
  base64Icon,
  jwtIcon,
  regexIcon,
  cronIcon,
  colourIcon,
  routeIcon,
  routePlannerIcon,
  downloadIcon,
  qrCodeIcon,
  clockIcon,
  // soccerIcon,
  // moviesIcon,
  mealPlannerIcon,
  memeStudioIcon,
  videoEditorIcon,
  boardGameIcon,
  solarRoofIcon,
  fileTransferIcon,
  imageUpscalerIcon,
  backgroundRemoverIcon,
  weatherIcon,
  fuelPricesIcon,
  songListenerIcon,
  imageToolboxIcon,
  subtitleStudioIcon,
  bankViewerIcon,
  subscriptionRadarIcon,
  expensesIcon,
  stockForecastIcon,
  stripLibraryIcon,
  bulkScannerIcon,
} from './icons'

// Register every utility here. Order determines sidebar order.
// Components are lazy-imported so each utility builds into its own chunk
// and only loads when the user opens it.
registerUtility({
  id: 'song-listener',
  name: 'Live Lyrics',
  description: 'Identify music through your microphone and follow synchronized lyrics in real time.',
  icon: songListenerIcon,
  availableWithoutAccount: false,
  component: lazy(() =>
    import('./song-listener/SongListener').then((m) => ({ default: m.SongListener }))
  ),
})

registerUtility({
  id: 'bank-viewer',
  name: 'Bank Viewer',
  description: 'Read-only bank balances and transactions, with your surplus at the start of each month.',
  icon: bankViewerIcon,
  category: 'finance',
  availableWithoutAccount: false,
  component: lazy(() =>
    import('./bank-viewer/BankViewer').then((m) => ({ default: m.BankViewer }))
  ),
})

registerUtility({
  id: 'subscription-radar',
  name: 'Subscription Radar',
  description: 'Finds recurring charges like streaming, gym and insurance in your Bank Viewer transactions, with monthly and yearly totals, price increases and charges you may have forgotten.',
  icon: subscriptionRadarIcon,
  category: 'finance',
  availableWithoutAccount: false,
  component: lazy(() =>
    import('./subscription-radar/SubscriptionRadar').then((m) => ({ default: m.SubscriptionRadar }))
  ),
})

registerUtility({
  id: 'expenses',
  name: 'Expenses',
  description: 'Everything that left your accounts each month, sorted into categories like groceries, housing and eating out, from your Bank Viewer transactions.',
  icon: expensesIcon,
  category: 'finance',
  availableWithoutAccount: false,
  component: lazy(() =>
    import('./expenses/Expenses').then((m) => ({ default: m.Expenses }))
  ),
})

registerUtility({
  id: 'stock-forecast',
  name: 'Stock Forecast',
  description: 'Chart real stock, ETF and crypto prices from any market with SMA, EMA and Bollinger overlays, buy/sell signals and trend or Monte Carlo projections.',
  icon: stockForecastIcon,
  availableWithoutAccount: false,
  component: lazy(() =>
    import('./stock-forecast/StockForecast').then((m) => ({ default: m.StockForecast }))
  ),
})

registerUtility({
  id: 'strip-library',
  name: 'Strip Library',
  description: 'Scan or type comic album ISBNs, look them up on stripinfo.be and keep track of your collection.',
  icon: stripLibraryIcon,
  availableWithoutAccount: false,
  component: lazy(() =>
    import('./strip-library/StripLibrary').then((m) => ({ default: m.StripLibrary }))
  ),
})

registerUtility({
  id: 'weather',
  name: 'Weather',
  description: 'Current conditions, forecasts, saved cities, and historical median highs and lows.',
  icon: weatherIcon,
  availableWithoutAccount: false,
  component: lazy(() =>
    import('./weather/Weather').then((m) => ({ default: m.Weather }))
  ),
})

registerUtility({
  id: 'fuel-prices',
  name: 'Fuel Prices',
  description: 'Today’s official Belgian maximum prices for Euro 95, Super 98 and diesel, with the recent trend.',
  icon: fuelPricesIcon,
  availableWithoutAccount: false,
  component: lazy(() =>
    import('./fuel-prices/FuelPrices').then((m) => ({ default: m.FuelPrices }))
  ),
})

// Developer tools — everything runs locally in the browser.
registerUtility({
  id: 'json-tools',
  name: 'JSON Formatter',
  description: 'Pretty-print, minify and validate JSON, or diff two documents path by path.',
  icon: jsonIcon,
  category: 'dev',
  availableWithoutAccount: true,
  component: lazy(() =>
    import('./dev-utils/JsonTool').then((m) => ({ default: m.JsonTool }))
  ),
})

registerUtility({
  id: 'base64',
  name: 'Base64',
  description: 'Encode and decode Base64 for text and files, with UTF-8 and URL-safe support.',
  icon: base64Icon,
  category: 'dev',
  availableWithoutAccount: true,
  component: lazy(() =>
    import('./dev-utils/Base64Tool').then((m) => ({ default: m.Base64Tool }))
  ),
})

registerUtility({
  id: 'jwt-decoder',
  name: 'JWT Decoder',
  description: 'Read a JSON Web Token’s header and claims, check expiry and verify HMAC signatures.',
  icon: jwtIcon,
  category: 'dev',
  availableWithoutAccount: true,
  component: lazy(() =>
    import('./dev-utils/JwtTool').then((m) => ({ default: m.JwtTool }))
  ),
})

registerUtility({
  id: 'regex-tester',
  name: 'Regex Tester',
  description: 'Test JavaScript regular expressions live with highlighted matches, groups and replacements.',
  icon: regexIcon,
  category: 'dev',
  availableWithoutAccount: true,
  component: lazy(() =>
    import('./dev-utils/RegexTool').then((m) => ({ default: m.RegexTool }))
  ),
})

registerUtility({
  id: 'cron-explainer',
  name: 'Cron Explainer',
  description: 'Turn a cron expression into plain language and see its next run times.',
  icon: cronIcon,
  category: 'dev',
  availableWithoutAccount: true,
  component: lazy(() =>
    import('./dev-utils/CronTool').then((m) => ({ default: m.CronTool }))
  ),
})

registerUtility({
  id: 'colour-converter',
  name: 'Colour Converter',
  description: 'Convert any CSS colour to HEX, RGB, HSL, OKLCH and more, with WCAG contrast checks.',
  icon: colourIcon,
  category: 'dev',
  availableWithoutAccount: true,
  component: lazy(() =>
    import('./dev-utils/ColourTool').then((m) => ({ default: m.ColourTool }))
  ),
})

registerUtility({
  id: 'text-case',
  name: 'Text Case Converter',
  description: 'Convert text between upper, lower, title, sentence, camel, Pascal, snake, constant, kebab and dot case.',
  icon: textCaseIcon,
  category: 'dev',
  availableWithoutAccount: true,
  component: lazy(() =>
    import('./text-case/TextCaseConverter').then((m) => ({ default: m.TextCaseConverter }))
  ),
})

registerUtility({
  id: 'image-toolbox',
  name: 'Image Toolbox',
  description: 'Resize, compress and convert images while removing metadata — entirely in your browser.',
  icon: imageToolboxIcon,
  category: 'media',
  availableWithoutAccount: true,
  component: lazy(() =>
    import('./image-toolbox/ImageToolbox').then((m) => ({ default: m.ImageToolbox }))
  ),
})

registerUtility({
  id: 'background-remover',
  name: 'Background Remover',
  description: 'Remove image and video backgrounds locally with open-source AI.',
  icon: backgroundRemoverIcon,
  category: 'media',
  availableWithoutAccount: true,
  component: lazy(() =>
    import('./background-remover/BackgroundRemover').then((m) => ({ default: m.BackgroundRemover }))
  ),
})

registerUtility({
  id: 'image-upscaler',
  name: 'AI Image Upscaler',
  description: 'Enlarge photos and illustrations by 2×, 3× or 4× with self-hosted AI.',
  icon: imageUpscalerIcon,
  category: 'media',
  availableWithoutAccount: false,
  component: lazy(() =>
    import('./image-upscaler/ImageUpscaler').then((m) => ({ default: m.ImageUpscaler }))
  ),
})

registerUtility({
  id: 'file-transfer',
  name: 'File Transfer',
  description: 'Upload a file and share it with a private link, with an optional password.',
  icon: fileTransferIcon,
  availableWithoutAccount: false,
  component: lazy(() =>
    import('./file-transfer/FileTransfer').then((m) => ({ default: m.FileTransfer }))
  ),
})

registerUtility({
  id: 'route-planner',
  name: 'Route Planner',
  description: 'Plan walking, running, cycling, motorcycle and car routes with elevation, directions, GPX export and live GPS navigation.',
  icon: routePlannerIcon,
  availableWithoutAccount: true,
  component: lazy(() =>
    import('./route-planner/RoutePlanner').then((m) => ({ default: m.RoutePlanner }))
  ),
})

registerUtility({
  id: 'route-optimizer',
  name: 'Shortest Route',
  description: 'Reorder a list of stops into the shortest route and open it in your maps app.',
  icon: routeIcon,
  availableWithoutAccount: false,
  component: lazy(() =>
    import('./route-optimizer/RouteOptimizer').then((m) => ({ default: m.RouteOptimizer }))
  ),
})

registerUtility({
  id: 'solar-roof',
  name: 'Solar Roof Planner',
  description:
    'Trace a roof on the satellite map, set each face’s slope and direction, and find the best surface for solar panels by yearly sun.',
  icon: solarRoofIcon,
  availableWithoutAccount: false,
  disabled: true, // too laggy for now
  component: lazy(() =>
    import('./solar-roof/SolarRoof').then((m) => ({ default: m.SolarRoof }))
  ),
})

registerUtility({
  id: 'yt-dlp',
  name: 'Video Downloader',
  description: 'Build a ready-to-run yt-dlp command to download video or audio locally.',
  icon: downloadIcon,
  availableWithoutAccount: false,
  component: lazy(() =>
    import('./yt-dlp/YtDlpCommand').then((m) => ({ default: m.YtDlpCommand }))
  ),
})

registerUtility({
  id: 'subtitle-studio',
  name: 'Subtitle Studio',
  description: 'Download or upload a video, transcribe it, edit subtitles, and export SRT or a captioned video.',
  icon: subtitleStudioIcon,
  category: 'media',
  availableWithoutAccount: false,
  component: lazy(() =>
    import('./subtitle-studio/SubtitleStudio').then((m) => ({ default: m.SubtitleStudio }))
  ),
})

registerUtility({
  id: 'qr-code',
  name: 'QR Code Generator',
  description: 'Create styled QR codes for URLs, WiFi, contacts, payments and more.',
  icon: qrCodeIcon,
  availableWithoutAccount: true,
  component: lazy(() =>
    import('./qr-code/QRCodeGenerator').then((m) => ({ default: m.QRCodeGenerator }))
  ),
})

registerUtility({
  id: 'work-hours',
  name: 'Work Hours',
  description: 'Track hours worked per week and days off to see how many hours you still owe for the month.',
  icon: clockIcon,
  availableWithoutAccount: false,
  component: lazy(() =>
    import('./work-hours/WorkHoursTracker').then((m) => ({ default: m.WorkHoursTracker }))
  ),
})

// registerUtility({
//   id: 'soccer-predictor',
//   name: 'Soccer Predictor',
//   description: 'Compare two teams or browse fixtures for a win % and likely scoreline.',
//   icon: soccerIcon,
//   availableWithoutAccount: false,
//   component: lazy(() =>
//     import('./soccer-predictor/SoccerPredictor').then((m) => ({ default: m.SoccerPredictor }))
//   ),
// })


registerUtility({
  id: 'meal-planner',
  name: 'Meal Planner',
  description: 'Plan a lunch and dinner for each day of the week from your own list of meals.',
  icon: mealPlannerIcon,
  availableWithoutAccount: false,
  component: lazy(() =>
    import('./meal-planner/MealPlanner').then((m) => ({ default: m.MealPlanner }))
  ),
})

registerUtility({
  id: 'meme-studio',
  name: 'Meme Studio',
  description:
    'Make memes from trending templates or your own image, GIF or video — add captions, flip and rotate, then download.',
  icon: memeStudioIcon,
  availableWithoutAccount: true,
  component: lazy(() =>
    import('./meme-studio/MemeStudio').then((m) => ({ default: m.MemeStudio }))
  ),
})

registerUtility({
  id: 'video-editor',
  name: 'Video Editor',
  description:
    'Stitch local video files on a timeline, layer text, images and colour cards, mix audio tracks, then export to MP4 — all in your browser.',
  icon: videoEditorIcon,
  category: 'media',
  availableWithoutAccount: true,
  component: lazy(() =>
    import('./video-editor/VideoEditor').then((m) => ({ default: m.VideoEditor }))
  ),
})

registerUtility({
  id: 'board-game-scores',
  name: 'Board Game Scores',
  description: 'Keep score for any board game — add players and rounds, live totals and a crowned leader. Saved to your account.',
  icon: boardGameIcon,
  availableWithoutAccount: false,
  component: lazy(() =>
    import('./board-game-scores/BoardGameScores').then((m) => ({ default: m.BoardGameScores }))
  ),
})

// registerUtility({
//   id: 'movies',
//   name: 'Movies & TV',
//   description: 'Browse popular, in-theatres/on-air and top-rated movies and TV via TMDB, filter or search, then stream — with saved favourites and watch history.',
//   icon: moviesIcon,
//   availableWithoutAccount: false,
//   component: lazy(() =>
//     import('./movies/Movies').then((m) => ({ default: m.Movies }))
//   ),
// })

registerUtility({
  id: 'wishlist',
  name: 'Wishlist',
  description: 'Collect gift ideas, add product links and share a list with anonymous gift reservations.',
  icon: wishlistIcon,
  availableWithoutAccount: false,
  component: lazy(() => import('./wishlist/Wishlist').then(m => ({ default: m.Wishlist }))),
})

registerUtility({
  id: 'bulk-scanner',
  name: 'Bulk Scanner',
  description: 'Desktop app for Windows, macOS and Linux: scan batches from a network scanner, name each scan by your own rules and save them as PDFs.',
  icon: bulkScannerIcon,
  availableWithoutAccount: true,
  component: lazy(() => import('./bulk-scanner/BulkScanner').then((m) => ({ default: m.BulkScanner }))),
})
