export const STR = {
  en: {
    title: 'Video Editor',
    intro: 'Stitch videos on a timeline, crop and position them, layer text, images and colour cards, mix audio, then export to MP4 — all in your browser. Local files are never uploaded.',
    addClip: 'Add video', addText: 'Add text', addImage: 'Add image', addColor: 'Add colour', addAudio: 'Add audio', fromUrl: 'From URL',
    empty: 'Add a video to get started', emptyHint: 'Drop files here, or import from a URL with the Video Downloader.',
    play: 'Play (Space)', pause: 'Pause (Space)', stop: 'Back to start',
    inspector: 'Inspector', nothingSelected: 'Select a clip or layer to edit it.',
    video: 'Video', overlays: 'Overlays', audio: 'Audio', timeline: 'Timeline',
    trimStart: 'In (s)', trimEnd: 'Out (s)', volume: 'Volume', mute: 'Mute', unmute: 'Unmute',
    moveLeft: 'Earlier', moveRight: 'Later', delete: 'Delete', split: 'Split (S)', undo: 'Undo (Ctrl+Z)', redo: 'Redo (Ctrl+Shift+Z)',
    snap: 'Snap', zoomIn: 'Zoom in (+)', zoomOut: 'Zoom out (−)', zoomFit: 'Fit',
    text: 'Text', color: 'Colour', background: 'Background', none: 'None', fontSize: 'Font size', align: 'Align', bold: 'Bold', opacity: 'Opacity',
    start: 'Start (s)', duration: 'Duration (s)', posX: 'X', posY: 'Y', width: 'Width', height: 'Height',
    transform: 'Position & scale', scale: 'Scale', center: 'Centre', resetTransform: 'Reset',
    crop: 'Crop', editCrop: 'Crop in preview', doneCrop: 'Done cropping', resetCrop: 'Reset crop', cropAspect: 'Crop shape', free: 'Free', outputShape: 'Output',
    cropL: 'Left %', cropT: 'Top %', cropR: 'Right %', cropB: 'Bottom %',
    export: 'Export', format: 'Format', exportVideo: 'Export & download', cancel: 'Cancel',
    exportNote: 'Export decodes and encodes on your GPU, usually several times faster than real time.',
    mp4Unsupported: 'This browser can’t encode MP4 — use WebM, or try Safari/Edge.',
    recordUnsupported: 'Your browser can’t encode video.',
    exportError: 'Export failed. Try again.', loadError: 'Could not load that file.',
    hint: 'Preview: drag to move, corner handles to scale. Timeline: drag clips to reorder, Alt+drag to slip the source, drag edges to trim, Ctrl+wheel to zoom. Keys: Space play, S split, ←/→ step, Del delete.',
    output: 'Output', aspect: 'Aspect ratio', original: 'Original', fit: 'Fit', fill: 'Fill (crop)', letterbox: 'Fit (letterbox)',
    urlTitle: 'Import from URL', urlPlaceholder: 'https://www.youtube.com/watch?v=…', quality: 'Quality', best: 'Best', audioOnly: 'Audio only',
    importBtn: 'Download & add', importing: 'Downloading…', processing: 'Processing on server…', transferring: 'Transferring…',
    signInForUrl: 'Sign in with Video Downloader access to import from a URL.', rightsNeeded: 'Confirm your media rights first.',
  },
  nl: {
    title: 'Video-editor',
    intro: 'Voeg video’s samen op een tijdlijn, snij ze bij en positioneer ze, leg tekst, afbeeldingen en kleurkaarten erover, mix audio en exporteer naar MP4 — allemaal in je browser. Lokale bestanden worden nooit geüpload.',
    addClip: 'Video toevoegen', addText: 'Tekst toevoegen', addImage: 'Afbeelding toevoegen', addColor: 'Kleur toevoegen', addAudio: 'Audio toevoegen', fromUrl: 'Via URL',
    empty: 'Voeg een video toe om te starten', emptyHint: 'Sleep bestanden hierheen, of importeer via een URL met de Video-downloader.',
    play: 'Afspelen (spatie)', pause: 'Pauzeren (spatie)', stop: 'Naar begin',
    inspector: 'Inspector', nothingSelected: 'Selecteer een clip of laag om te bewerken.',
    video: 'Video', overlays: 'Lagen', audio: 'Audio', timeline: 'Tijdlijn',
    trimStart: 'In (s)', trimEnd: 'Uit (s)', volume: 'Volume', mute: 'Dempen', unmute: 'Dempen opheffen',
    moveLeft: 'Eerder', moveRight: 'Later', delete: 'Verwijderen', split: 'Knippen (S)', undo: 'Ongedaan maken (Ctrl+Z)', redo: 'Opnieuw (Ctrl+Shift+Z)',
    snap: 'Uitlijnen', zoomIn: 'Inzoomen (+)', zoomOut: 'Uitzoomen (−)', zoomFit: 'Passend',
    text: 'Tekst', color: 'Kleur', background: 'Achtergrond', none: 'Geen', fontSize: 'Lettergrootte', align: 'Uitlijning', bold: 'Vet', opacity: 'Dekking',
    start: 'Start (s)', duration: 'Duur (s)', posX: 'X', posY: 'Y', width: 'Breedte', height: 'Hoogte',
    transform: 'Positie & schaal', scale: 'Schaal', center: 'Centreren', resetTransform: 'Herstellen',
    crop: 'Bijsnijden', editCrop: 'Bijsnijden in voorbeeld', doneCrop: 'Klaar met bijsnijden', resetCrop: 'Uitsnede herstellen', cropAspect: 'Vorm uitsnede', free: 'Vrij', outputShape: 'Uitvoer',
    cropL: 'Links %', cropT: 'Boven %', cropR: 'Rechts %', cropB: 'Onder %',
    export: 'Exporteren', format: 'Formaat', exportVideo: 'Exporteren & downloaden', cancel: 'Annuleren',
    exportNote: 'Exporteren decodeert en encodeert op je GPU, meestal meerdere keren sneller dan realtime.',
    mp4Unsupported: 'Deze browser kan geen MP4 maken — gebruik WebM of probeer Safari/Edge.',
    recordUnsupported: 'Je browser kan geen video encoderen.',
    exportError: 'Export mislukt. Probeer opnieuw.', loadError: 'Kon dat bestand niet laden.',
    hint: 'Voorbeeld: sleep om te verplaatsen, hoekgrepen om te schalen. Tijdlijn: sleep clips om te herschikken, Alt+slepen om de bron te verschuiven, sleep randen om bij te snijden, Ctrl+scrollen om te zoomen. Toetsen: spatie afspelen, S knippen, ←/→ stap, Del verwijderen.',
    output: 'Uitvoer', aspect: 'Beeldverhouding', original: 'Origineel', fit: 'Passing', fill: 'Vullen (bijsnijden)', letterbox: 'Passend (zwarte balken)',
    urlTitle: 'Importeren via URL', urlPlaceholder: 'https://www.youtube.com/watch?v=…', quality: 'Kwaliteit', best: 'Beste', audioOnly: 'Enkel audio',
    importBtn: 'Downloaden & toevoegen', importing: 'Downloaden…', processing: 'Verwerken op server…', transferring: 'Overzetten…',
    signInForUrl: 'Log in met toegang tot de Video-downloader om via een URL te importeren.', rightsNeeded: 'Bevestig eerst je mediarechten.',
  },
}

export type T = (typeof STR)['en']

export function fmtTime(s: number, precise = true): string {
  if (!isFinite(s) || s < 0) s = 0
  const m = Math.floor(s / 60), sec = s - m * 60
  return precise ? `${m}:${sec.toFixed(1).padStart(4, '0')}` : `${m}:${String(Math.floor(sec)).padStart(2, '0')}`
}
