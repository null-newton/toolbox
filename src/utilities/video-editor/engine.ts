/**
 * Playback engine shared by the live preview and the exporter.
 *
 * TimelineDriver owns the playhead and a pool of <video> elements (one per
 * clip). Each frame, update() figures out which clip should be on screen, makes
 * sure that element is the one playing (pausing the others), and — while
 * playing — slaves the playhead to that element's own clock so audio and video
 * stay locked. Only the active clip's element is ever un-paused, so audio
 * "just works" in both preview (element volume) and export (Web Audio gain),
 * because every inactive source is silent by virtue of being paused.
 */
import {
  clipAt,
  layoutClips,
  totalDuration,
  type AudioTrack,
  type PlacedClip,
  type VideoClip,
} from './types'

export class TimelineDriver {
  private placed: PlacedClip[]
  readonly total: number
  playhead = 0
  playing = false
  private activeId: string | null = null
  private videoEls: Map<string, HTMLVideoElement>

  constructor(clips: VideoClip[], videoEls: Map<string, HTMLVideoElement>) {
    this.videoEls = videoEls
    this.placed = layoutClips(clips)
    this.total = totalDuration(clips)
  }

  private activeEl(): HTMLVideoElement | null {
    return this.activeId ? this.videoEls.get(this.activeId) ?? null : null
  }

  pauseAll() {
    for (const el of this.videoEls.values()) if (!el.paused) el.pause()
  }

  play() {
    this.playing = true
  }

  pause() {
    this.playing = false
    this.pauseAll()
  }

  /** Jump to a global time, seeking the matching clip and parking the rest. */
  seek(t: number) {
    this.playhead = Math.max(0, Math.min(this.total, t))
    this.pauseAll()
    const hit = clipAt(this.placed, this.playhead)
    if (hit) {
      this.activeId = hit.placed.clip.id
      const el = this.activeEl()
      if (el) {
        try {
          el.currentTime = hit.sourceTime
        } catch {
          /* element not ready yet — it'll seek on the next update */
        }
        if (this.playing) el.play().catch(() => {})
      }
    } else {
      this.activeId = null
    }
  }

  /**
   * Reconcile the active element with the current playhead and (when playing)
   * advance the playhead from the element clock. Returns the frame source to
   * draw, or null when the timeline is empty.
   */
  update(): { source: HTMLVideoElement; sw: number; sh: number; clip: VideoClip } | null {
    const hit = clipAt(this.placed, this.playhead)
    if (!hit) return null

    const wantId = hit.placed.clip.id
    if (wantId !== this.activeId) {
      const prev = this.activeEl()
      if (prev && !prev.paused) prev.pause()
      this.activeId = wantId
      const el = this.activeEl()
      if (el) {
        try {
          el.currentTime = hit.sourceTime
        } catch {
          /* seek when ready */
        }
        if (this.playing) el.play().catch(() => {})
      }
    }

    const el = this.activeEl()
    if (!el) return null

    if (this.playing) {
      const local = el.currentTime - hit.placed.clip.trimStart
      if (local >= hit.placed.length - 1e-3) {
        // Clip finished — park the playhead at its end so the next update()
        // rolls onto the following clip (or the timeline end). Do NOT call
        // play() here: a clip that reached its source end is paused, and
        // play() would restart it from zero and loop forever.
        this.playhead = hit.placed.offset + hit.placed.length
      } else {
        if (local >= 0) this.playhead = hit.placed.offset + local
        if (el.paused) el.play().catch(() => {})
      }
    }

    return { source: el, sw: el.videoWidth, sh: el.videoHeight, clip: hit.placed.clip }
  }
}

// Play/pause extra audio tracks to match the playhead (volume is the caller's job); resyncs on drift.
export function syncAudioElements(tracks: AudioTrack[], els: Map<string, HTMLMediaElement>, playhead: number, playing: boolean) {
  for (const tr of tracks) {
    const el = els.get(tr.id)
    if (!el) continue
    const want = tr.trimStart + playhead - tr.start
    if (playing && playhead >= tr.start && playhead < tr.start + tr.length) {
      if (el.paused || Math.abs(el.currentTime - want) > 0.3) { try { el.currentTime = Math.max(0, Math.min(tr.duration, want)) } catch { /* not ready */ } }
      if (el.paused) el.play().catch(() => {})
    } else if (!el.paused) el.pause()
  }
}
