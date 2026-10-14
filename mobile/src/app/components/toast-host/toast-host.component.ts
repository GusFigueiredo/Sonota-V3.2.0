import { CommonModule } from '@angular/common';
import { Component, HostListener } from '@angular/core';

export type ToastKind = 'success' | 'error' | 'info' | 'warning';
export interface SonotaToast {
  id: number;
  kind: ToastKind;
  title: string;
  message?: string;
  duration?: number;
}

@Component({
  selector: 'app-toast-host',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="toast-container sonota-toast-container" aria-live="polite" aria-relevant="additions">
      @for (toast of toasts; track toast.id) {
        <div class="toast sonota-toast" [class.good]="toast.kind==='success'" [class.bad]="toast.kind==='error'" [class.info]="toast.kind==='info'" [class.warn]="toast.kind==='warning'" role="status">
          <span class="sonota-toast-icon" aria-hidden="true">{{icon(toast.kind)}}</span>
          <div class="sonota-toast-copy">
            <strong>{{toast.title}}</strong>
            @if(toast.message){<span>{{toast.message}}</span>}
          </div>
          <button type="button" class="sonota-toast-close" (click)="dismiss(toast.id)" aria-label="Fechar aviso">×</button>
        </div>
      }
    </div>
  `
})
export class ToastHostComponent {
  toasts: SonotaToast[] = [];
  private sequence = 0;
  private timers = new Map<number, ReturnType<typeof setTimeout>>();

  @HostListener('window:sonota-toast', ['$event'])
  onToast(event: Event) {
    const detail = (event as CustomEvent).detail || {};
    const toast: SonotaToast = {
      id: ++this.sequence,
      kind: ['success','error','info','warning'].includes(detail.kind) ? detail.kind : 'info',
      title: String(detail.title || 'Sonota'),
      message: detail.message ? String(detail.message) : '',
      duration: Number(detail.duration) || (detail.kind === 'error' ? 6500 : 3800)
    };
    this.toasts = [...this.toasts.slice(-3), toast];
    const timer = setTimeout(() => this.dismiss(toast.id), toast.duration);
    this.timers.set(toast.id, timer);
  }

  dismiss(id: number) {
    const timer = this.timers.get(id);
    if (timer) clearTimeout(timer);
    this.timers.delete(id);
    this.toasts = this.toasts.filter(x => x.id !== id);
  }

  icon(kind: ToastKind) {
    return kind === 'success' ? '✓' : kind === 'error' ? '!' : kind === 'warning' ? '⚠' : 'i';
  }
}
