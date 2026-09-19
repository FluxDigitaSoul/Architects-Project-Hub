import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, output, signal } from '@angular/core';
import { Icon } from '../../shared/ui/icon';

const MAX_SECONDS = 600; // 10 minuti (AFU FR-M4-08, Q-13)
const CHUNK_MS = 5000; // salvataggio a blocchi: una chiamata o il blocco schermo non perdono l'audio (EC-06)

export interface Recording {
  blob: Blob;
  durationSec: number;
}

/** Registratore vocale in-app, con un tap per iniziare e uno per fermare (AFU FR-M4-08). */
@Component({
  selector: 'app-voice-recorder',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="rec" [class.is-on]="recording()">
      <button type="button" class="mic" (click)="toggle()" [attr.aria-label]="recording() ? 'Ferma registrazione' : 'Avvia registrazione'">
        @if (recording()) { <span class="stop"></span> } @else { <ui-icon name="mic" [size]="26" /> }
      </button>
      <div class="rec-text">
        @if (recording()) {
          <b class="mono">{{ clock() }}</b>
          <span class="small muted">Registrazione in corso · tocca per fermare@if (seconds() > 540) { · <span style="color:var(--warning)">limite a 10:00</span> }</span>
        } @else if (error()) {
          <b style="color:var(--danger)">Microfono non disponibile</b>
          <span class="small muted">{{ error() }}</span>
        } @else {
          <b>Nota vocale</b>
          <span class="small muted">Tocca e parla: avanzamento, difformità, disposizioni.</span>
        }
      </div>
    </div>
  `,
  styles: `
    .rec { display: flex; align-items: center; gap: 14px; padding: 14px; border: 1px solid var(--line); border-radius: 14px; background: var(--surface); }
    .rec.is-on { border-color: var(--danger); background: var(--danger-soft); }
    .mic { width: 64px; height: 64px; border-radius: 50%; border: 0; background: var(--color-primary); color: var(--color-primary-contrast); display: grid; place-items: center; cursor: pointer; flex: none; box-shadow: var(--shadow-md); }
    .is-on .mic { background: var(--danger); color: #fff; animation: pulse 1.4s ease-in-out infinite; }
    .stop { width: 20px; height: 20px; border-radius: 4px; background: #fff; }
    .rec-text { display: grid; gap: 2px; }
    @keyframes pulse { 0%, 100% { box-shadow: 0 0 0 0 rgba(220, 38, 38, 0.45); } 50% { box-shadow: 0 0 0 12px rgba(220, 38, 38, 0); } }
  `,
})
export class VoiceRecorder {
  readonly recorded = output<Recording>();
  protected readonly recording = signal(false);
  protected readonly seconds = signal(0);
  protected readonly error = signal('');
  protected readonly clock = computed(() => {
    const s = this.seconds();
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  });

  private recorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private chunks: Blob[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private wakeLock: { release(): Promise<void> } | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.stop());
  }

  protected toggle(): void {
    if (this.recording()) this.stop();
    else void this.start();
  }

  private async start(): Promise<void> {
    this.error.set('');
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      this.error.set('Questo browser non supporta la registrazione. Puoi scrivere la nota a mano.');
      return;
    }
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      this.error.set('Permesso negato: abilita il microfono nelle impostazioni del browser, oppure scrivi la nota a mano.');
      return;
    }
    this.chunks = [];
    this.recorder = new MediaRecorder(this.stream);
    this.recorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };
    this.recorder.onstop = () => {
      const blob = new Blob(this.chunks, { type: this.recorder?.mimeType || 'audio/webm' });
      if (blob.size > 0) this.recorded.emit({ blob, durationSec: this.seconds() });
    };
    this.recorder.start(CHUNK_MS);
    this.seconds.set(0);
    this.recording.set(true);
    this.timer = setInterval(() => {
      this.seconds.update((s) => s + 1);
      if (this.seconds() >= MAX_SECONDS) this.stop();
    }, 1000);
    try {
      const nav = navigator as Navigator & { wakeLock?: { request(type: 'screen'): Promise<{ release(): Promise<void> }> } };
      this.wakeLock = (await nav.wakeLock?.request('screen')) ?? null;
    } catch {
      this.wakeLock = null;
    }
  }

  private stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.recorder && this.recorder.state !== 'inactive') this.recorder.stop();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    void this.wakeLock?.release().catch(() => undefined);
    this.wakeLock = null;
    this.recording.set(false);
  }
}
